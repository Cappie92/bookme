import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '@src/config/env';
import { logger } from '@src/utils/logger';
import { normalizeRelativeUrlForApiBase, isMasterExclusiveApiPath } from '@src/utils/normalizeApiUrl';
import { readToken } from '@src/auth/tokenStorage';
import { recordApiErrorSnapshot } from '@src/debug/mobileErrorCapture';
import { authTrace, isAuthRuntimeTraceEnabled } from '@src/debug/authRuntimeTrace';

// Создаем axios инстанс (в dev меньший timeout для быстрого retry)
const apiClient: AxiosInstance = axios.create({
  baseURL: env.API_URL,
  timeout: __DEV__ ? 8000 : 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const DEBUG_BODY_PREVIEW_MAX = 4000;

function truncateForDebug(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function previewResponseBody(data: unknown): string | undefined {
  if (data === undefined || data === null) return undefined;
  if (typeof data === 'string') return truncateForDebug(data, DEBUG_BODY_PREVIEW_MAX);
  if (typeof data === 'object') {
    try {
      return truncateForDebug(JSON.stringify(data), DEBUG_BODY_PREVIEW_MAX);
    } catch {
      return truncateForDebug(String(data), DEBUG_BODY_PREVIEW_MAX);
    }
  }
  return truncateForDebug(String(data), DEBUG_BODY_PREVIEW_MAX);
}

/** Снимок для панели DBG (SHOW_DBG_FLOATING_PANEL, строго DEBUG_MOBILE_ERRORS=1); не меняет поведение API. */
function captureAxiosErrorForMobileDebug(error: AxiosError): void {
  if (!__DEV__ || !env.SHOW_DBG_FLOATING_PANEL) return;

  const originalRequest = error.config as InternalAxiosRequestConfig | undefined;
  const path = originalRequest?.url || '';
  const hadToken =
    !!originalRequest?.headers?.Authorization || !!apiClient.defaults.headers.common['Authorization'];
  const status = error.response?.status;
  const is401WithoutToken = status === 401 && !hadToken;
  const silent404Substrings = [
    'master/loyalty/templates',
    'master/loyalty/status',
    'client/master-notes/',
    'client/salon-notes/',
  ];
  const isSilent404 =
    status === 404 &&
    (silent404Substrings.some((s) => path.includes(s)) ||
      (path.includes('client/favorites/') && (originalRequest?.method || '').toLowerCase() === 'delete'));

  if (is401WithoutToken || isSilent404) return;
  // Тот же ожидаемый 401 на bootstrap /me — не засоряем DBG-панель (логика API не меняется).
  if (status === 401 && /auth\/users\/me/i.test(path)) return;

  const baseURL = String(originalRequest?.baseURL ?? apiClient.defaults.baseURL ?? '');
  const method = (originalRequest?.method || 'get').toUpperCase();
  let fullUrl = '';
  try {
    if (originalRequest) {
      fullUrl = axios.getUri({
        ...originalRequest,
        baseURL: originalRequest.baseURL ?? apiClient.defaults.baseURL,
      } as InternalAxiosRequestConfig);
    }
  } catch {
    fullUrl = `${baseURL.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  const data = error.response?.data as { detail?: unknown; message?: unknown } | undefined;
  const message = String(data?.detail ?? data?.message ?? error.message ?? '(no message)');

  recordApiErrorSnapshot({
    method,
    path,
    fullUrl: fullUrl || `${baseURL.replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`,
    status: error.response?.status,
    code: (error as AxiosError & { code?: string }).code,
    message,
    bodyPreview: error.response ? previewResponseBody(error.response.data) : undefined,
    platform: Platform.OS,
    effectiveApiUrl: env.API_URL,
  });
}

// Request interceptor - добавляем токен авторизации
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const baseURL = config.baseURL ?? apiClient.defaults.baseURL;
    if (config.url) {
      const normalized = normalizeRelativeUrlForApiBase(baseURL, config.url);
      if (normalized !== undefined) {
        config.url = normalized;
      }
    }

    const url = config.url || '';
    if (__DEV__ && isMasterExclusiveApiPath(url)) {
      try {
        const userJson = await AsyncStorage.getItem('user_data');
        if (userJson) {
          const user = JSON.parse(userJson);
          const role = (user?.role || '').toString().toLowerCase();
          if (role === 'client') {
            const err = new Error('master endpoint called in client mode');
            logger.error('❌ [API] GUARD: master API вызван при role=client:', url, err.stack);
            throw err;
          }
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message === 'master endpoint called in client mode') throw e;
      }
    }

    logger.http('🌐 [API] Запрос:', config.method?.toUpperCase(), config.url);

    try {
      const token = await readToken();
      
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
        logger.http('🔑 [API] Токен добавлен в заголовки');
      } else {
        logger.http('🔑 [API] Токен не найден (первый запрос)');
      }
    } catch (error) {
      logger.warn('⚠️ [API] Ошибка получения токена для запроса:', error);
    }
    
    return config;
  },
  (error: AxiosError) => {
    captureAxiosErrorForMobileDebug(error);
    logger.error('❌ [API] Ошибка в request interceptor:', error);
    return Promise.reject(error);
  }
);

// Response interceptor - обработка ошибок
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    if (response.config.url?.includes('master/subscription/features')) {
      logger.debug('features', '🧩 [FEATURES RESPONSE]', response.data);
    }
    if (isAuthRuntimeTraceEnabled() && /auth\/users\/me/i.test(response.config.url || '')) {
      try {
        const full = axios.getUri({
          ...response.config,
          baseURL: response.config.baseURL ?? apiClient.defaults.baseURL,
        } as InternalAxiosRequestConfig);
        authTrace(
          `[axios /me] RESPONSE OK status=${response.status} fullURL=${full} effective_API_URL=${env.API_URL} platform=${Platform.OS}`
        );
      } catch {
        authTrace(
          `[axios /me] RESPONSE OK status=${response.status} url=${response.config.url ?? ''} effective_API_URL=${env.API_URL}`
        );
      }
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (isAuthRuntimeTraceEnabled() && /auth\/users\/me/i.test(originalRequest?.url || '')) {
      const st = error.response?.status;
      const code = (error as AxiosError & { code?: string }).code;
      if (st != null) {
        authTrace(
          `[axios /me] RESPONSE ERROR status=${st} code=${code ?? 'n/a'} effective_API_URL=${env.API_URL} platform=${Platform.OS} msg=${error.message}`
        );
      } else {
        authTrace(
          `[axios /me] RESPONSE ERROR no_response network/timeout code=${code ?? 'n/a'} effective_API_URL=${env.API_URL} platform=${Platform.OS} msg=${error.message}`
        );
      }
    }

    // Обработка 401 Unauthorized.
    // Важно: не очищаем сессию в interceptor, чтобы не было platform-specific logout race.
    // Источник истины по logout/invalidation — только AuthContext (bootstrap/refresh/logout).
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      // Проверяем, был ли токен в запросе
      const hadToken = originalRequest.headers?.Authorization || apiClient.defaults.headers.common['Authorization'];
      
      const reqUrl = originalRequest.url || '';
      const isAuthMeRequest = reqUrl.includes('auth/users/me');
      
      // Если токена не было, не логируем как ERROR и не очищаем токен
      if (!hadToken) {
        logger.http('🔑 [API] 401 без токена (ожидаемо) - URL:', originalRequest.url);
      } else {
        if (__DEV__ && env.DEBUG_AUTH) {
          logger.info('auth', '[API] 401 с токеном (без авто-logout в interceptor)', {
            url: originalRequest.url,
            isAuthMeRequest,
            platform: Platform.OS,
            hadDefaultAuthHeader: !!apiClient.defaults.headers.common['Authorization'],
          });
        }
      }
    }

    // Обработка других ошибок
    if (error.response) {
      // Сервер вернул ошибку
      const status = error.response.status;
      const data = error.response.data as any;
      const url = originalRequest?.url || '';
      
      // Проверяем, был ли токен в запросе
      const hadToken = originalRequest.headers?.Authorization || apiClient.defaults.headers.common['Authorization'];
      
      // Не логируем 401 как ERROR, если токена не было (ожидаемое поведение)
      const is401WithoutToken = status === 401 && !hadToken;
      
      // Не логируем 404 для endpoints, где "not found" — нормальный empty state
      const silent404Substrings = [
        'master/loyalty/templates',
        'master/loyalty/status',
        'client/master-notes/',
        'client/salon-notes/',
      ];

      const isSilent404 = status === 404 && (
        silent404Substrings.some((s) => url.includes(s)) ||
        (url.includes('client/favorites/') && (originalRequest?.method || '').toLowerCase() === 'delete')
      );

      if (!isSilent404 && !is401WithoutToken) {
        logger.error('API Error:', { status, message: data?.detail || data?.message || error.message, url });
      }

      // Точная диагностика 405 на day schedule (только DEBUG_HTTP): метод = реально отправленный (без скрытого PUT-retry)
      if (
        __DEV__ &&
        status === 405 &&
        env.DEBUG_HTTP &&
        typeof url === 'string' &&
        url.includes('schedule/day')
      ) {
        const full = axios.getUri({
          ...originalRequest,
          baseURL: originalRequest.baseURL ?? apiClient.defaults.baseURL,
        } as InternalAxiosRequestConfig);
        const allowHdr =
          (error.response?.headers?.['allow'] as string | undefined) ||
          (error.response?.headers?.['Allow'] as string | undefined);
        logger.http('[schedule/day] 405 — фактический запрос:', {
          method: (originalRequest.method || 'get').toUpperCase(),
          baseURL: originalRequest.baseURL ?? apiClient.defaults.baseURL,
          path: originalRequest.url,
          full,
          responseAllow: allowHdr,
          hint:
            'Если Allow только GET — часто запущен старый backend без POST/PUT /api/master/schedule/day; иначе SPA catch-all GET /{full_path} матчит путь. Перезапустите uvicorn с актуальным кодом.',
        });
      }
    } else if (error.request) {
      const url = originalRequest?.url ?? '';
      const baseURL = apiClient.defaults.baseURL ?? '';
      const isTimeout = (error as any).code === 'ECONNABORTED' || (error.message || '').toLowerCase().includes('timeout');
      let fullUrl = '';
      try {
        fullUrl = axios.getUri({
          ...originalRequest,
          baseURL: originalRequest.baseURL ?? apiClient.defaults.baseURL,
        } as InternalAxiosRequestConfig);
      } catch {
        fullUrl = `${String(baseURL).replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
      }
      if (__DEV__ && env.DEBUG_HTTP) {
        if (isTimeout) {
          logger.http('❌ [API] TIMEOUT:', { url, baseURL });
        } else {
          logger.http('❌ [API] NETWORK ERROR (нет ответа):', { url, baseURL, code: (error as any).code, message: error.message });
        }
      }
      // Dev-only: при ERR_NETWORK сразу видно полный URL и платформу (без DEBUG_HTTP).
      if (__DEV__ && !isTimeout) {
        console.warn('[API] ERR_NETWORK context', {
          platform: Platform.OS,
          baseURL: baseURL || '(empty)',
          path: url,
          fullUrl: fullUrl || '(unresolved)',
          code: (error as AxiosError & { code?: string }).code,
        });
      }
      logger.error('❌ [API] NETWORK ERROR (запрос отправлен, но ответа нет):');
      logger.error('❌ [API] Message:', error.message, 'Code:', (error as any).code, 'URL:', originalRequest?.url);
    } else {
      logger.error('Request Error:', error.message);
    }

    captureAxiosErrorForMobileDebug(error);
    return Promise.reject(error);
  }
);

export { apiClient };
export default apiClient;

