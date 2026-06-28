import { isAxiosError } from 'axios';
import { apiClient } from './client';
import { normalizeRussianPhoneForApi } from '@src/utils/normalizeRussianPhoneForApi';
import { AUTH_REQUEST_TIMEOUT_MS } from '@src/utils/apiNetworkError';

// Типы для авторизации
export interface LoginCredentials {
  phone: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user?: {
    id: number;
    email: string;
    phone: string | null;
    role: string;
    is_verified: boolean;
    is_phone_verified: boolean;
    phone_required?: boolean;
    phone_verified?: boolean;
  };
}

export type OAuthExchangeResponse = LoginResponse;

export interface RegisterCredentials {
  email: string;
  phone: string;
  password: string;
  full_name: string;
  role?: 'client' | 'master' | 'salon' | 'admin';
  city?: string;
  timezone?: string;
  promo_code?: string;
}

export interface User {
  id: number;
  email: string;
  phone: string | null;
  full_name: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  is_phone_verified?: boolean;
  phone_required?: boolean;
  phone_verified?: boolean;
  birth_date?: string;
  created_at: string;
  updated_at: string;
}

function maskPhoneForLog(phone: string): string {
  if (phone.length < 6) return '(short)';
  return `${phone.slice(0, 4)}…${phone.slice(-2)}`;
}

function pickLoginErrorDetail(data: unknown): string | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const d = data as { detail?: unknown; message?: unknown };
  if (typeof d.detail === 'string') return d.detail;
  if (Array.isArray(d.detail)) {
    return d.detail
      .map((x) => (x && typeof x === 'object' && 'msg' in x ? String((x as { msg?: unknown }).msg) : String(x)))
      .join(' ');
  }
  if (typeof d.message === 'string') return d.message;
  return undefined;
}

/**
 * Вход в систему (тот же контракт, что web: JSON `{ phone, password }`, телефон как в `normalizeRussianPhoneForApi`).
 */
export async function login(credentials: LoginCredentials): Promise<LoginResponse> {
  const phoneForApi = normalizeRussianPhoneForApi((credentials.phone ?? '').trim());
  const body = { phone: phoneForApi, password: credentials.password };

  try {
    const response = await apiClient.post<LoginResponse>('/api/auth/login', body, {
      timeout: AUTH_REQUEST_TIMEOUT_MS,
    });
    return response.data;
  } catch (err: unknown) {
    if (typeof __DEV__ !== 'undefined' && __DEV__ && isAxiosError(err)) {
      const detail = pickLoginErrorDetail(err.response?.data);
      console.log('[LOGIN/API] failed', {
        method: 'POST',
        path: '/api/auth/login',
        contentType: 'application/json',
        phoneNormalized: maskPhoneForLog(phoneForApi),
        status: err.response?.status,
        backendDetail: detail != null ? String(detail).slice(0, 200) : undefined,
      });
    }
    throw err;
  }
}

/**
 * Регистрация нового пользователя
 */
export async function register(credentials: RegisterCredentials): Promise<LoginResponse> {
  const role = credentials.role || 'client';
  const payload: Record<string, unknown> = {
    email: (credentials.email ?? '').trim().toLowerCase(),
    phone: normalizeRussianPhoneForApi((credentials.phone ?? '').trim()),
    password: credentials.password,
    full_name: credentials.full_name,
    role,
  };
  if (role === 'master' && credentials.city?.trim()) {
    payload.city = credentials.city.trim();
  }
  if (role === 'master' && credentials.timezone?.trim()) {
    payload.timezone = credentials.timezone.trim();
  }
  if (role === 'master' && credentials.promo_code?.trim()) {
    payload.promo_code = credentials.promo_code.trim();
  }
  const response = await apiClient.post<LoginResponse>('/api/auth/register', payload);
  return response.data;
}

export function getYandexLoginUrl(): string {
  const baseURL = String(apiClient.defaults?.baseURL || '').replace(/\/$/, '');
  return `${baseURL}/api/auth/yandex/login`;
}

// TODO(mobile-yandex-auth): after App Store / Google Play publication, configure
// Yandex mobile platforms, add redirect/deep link scheme, implement AuthSession/browser flow,
// handle /auth/oauth/callback?ticket=..., call exchangeOAuthTicket(), then save tokens via AuthContext.
export async function exchangeOAuthTicket(ticket: string): Promise<OAuthExchangeResponse> {
  const response = await apiClient.post<OAuthExchangeResponse>('/api/auth/oauth/exchange', { ticket });
  return response.data;
}

/**
 * Получить данные текущего пользователя
 * Требует авторизации (токен в заголовках)
 */
export async function getCurrentUser(): Promise<User> {
  const response = await apiClient.get<User>('/api/auth/users/me');
  return response.data;
}

