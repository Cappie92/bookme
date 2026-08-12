import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { isAxiosError } from 'axios';
import {
  login as apiLogin,
  register as apiRegister,
  cancelSignupPhoneVerification,
  getCurrentUser,
  isAuthenticatedResponse,
  isPhoneVerificationRequiredResponse,
  type AuthenticatedResponse,
  type LoginCredentials,
  type RegisterCredentials,
  type User,
} from '@src/services/api/auth';
import { apiClient } from '@src/services/api/client';
import { invalidateSubscriptionCaches } from '@src/utils/subscriptionCache';
import { logger } from '@src/utils/logger';
import { withTimeout } from '@src/utils/promiseWithTimeout';
import { env } from '@src/config/env';
import {
  authTrace,
  authTraceDestructive,
  authTraceStorageSnapshot,
  authTraceReadTokenHint,
} from '@src/debug/authRuntimeTrace';
import {
  AUTH_INSTALL_MARKER,
  AUTH_LOGOUT_MARKER,
  AUTH_REFRESH_TOKEN_KEY,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  clearLogoutMarker,
  deleteSecureAuthItems,
  peekSecureToken,
  readInstallMarker,
  readLogoutMarker,
  readToken,
  setInstallMarker,
  setLogoutMarker,
  writeToken,
  writeRefreshToken,
} from '@src/auth/tokenStorage';
import {
  clearPendingPhoneVerification,
  getPendingPhoneVerification,
  isPendingPhoneVerificationExpired,
  setPendingPhoneVerification,
  type PendingPhoneVerification,
  type PendingPhoneVerificationOrigin,
  type PendingPhoneVerificationRole,
} from '@src/auth/pendingPhoneVerificationStorage';
import { logAuthDiag } from '@src/debug/authDiag';
import { registerInvalidSessionHandler } from '@src/auth/authSessionBridge';
import { analytics, AnalyticsEvent } from '@src/services/analytics';

const GET_USER_TIMEOUT_MS = 8000;

function userDiagFields(u: User | null): { userId: number | null; phone: string | null; email: string | null } {
  if (!u) return { userId: null, phone: null, email: null };
  return { userId: u.id, phone: u.phone ?? null, email: u.email ?? null };
}

export type AuthFlowResult =
  | { status: 'authenticated'; user: User | null }
  | { status: 'phone_verification_required'; pending: PendingPhoneVerification };

interface AuthContextType {
  user: User | null;
  token: string | null;
  pendingPhoneVerification: PendingPhoneVerification | null;
  pendingVerificationNeedsLogin: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthFlowResult>;
  register: (credentials: RegisterCredentials) => Promise<AuthFlowResult>;
  completePhoneVerification: (response: AuthenticatedResponse) => Promise<User>;
  cancelPendingPhoneVerification: () => Promise<void>;
  expirePendingPhoneVerification: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Повторная попытка загрузки сессии (для failsafe) */
  retryInit: () => Promise<void>;
  /** Инвариант: на /login токена в storage быть не должно. Вызвать при отображении экрана логина. */
  ensureNoTokenOnLogin: () => Promise<void>;
}

export type { AuthContextType, User };

const AuthContext = createContext<AuthContextType | undefined>(undefined);
export { AuthContext };

const TOKEN_KEY = AUTH_TOKEN_KEY;
const USER_KEY = AUTH_USER_KEY;

const LEGACY_AUTH_KEYS = ['token', 'jwt', '@token', 'auth_token', 'authToken', 'user_data', 'userData', 'user'];

const AUTH_KEY_REGEX = /token|auth|user|jwt|session/i;

/** Удалить token и user_data из обоих хранилищ + legacy + любые ключи, подходящие под regex. */
async function clearAllAuthStorage(
  reason?: string,
  opts?: { preserveLogoutMarker?: boolean }
): Promise<void> {
  const toRemove = new Set<string>([
    AUTH_TOKEN_KEY,
    AUTH_REFRESH_TOKEN_KEY,
    AUTH_USER_KEY,
    AUTH_LOGOUT_MARKER,
    AUTH_INSTALL_MARKER,
    ...LEGACY_AUTH_KEYS,
  ]);
  if (opts?.preserveLogoutMarker) {
    toRemove.delete(AUTH_LOGOUT_MARKER);
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    for (const k of keys) {
      if (AUTH_KEY_REGEX.test(k)) toRemove.add(k);
    }
    if (opts?.preserveLogoutMarker) {
      toRemove.delete(AUTH_LOGOUT_MARKER);
    }
    for (const k of toRemove) {
      await AsyncStorage.removeItem(k);
    }
  } catch (e) {
    logger.error('clearAllAuthStorage AsyncStorage', e);
  }
  await deleteSecureAuthItems();
}

async function loadCachedUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

/** Без валидного access token cached user не должен оставаться в storage. */
async function clearOrphanUserAndFeatureCaches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
  await deleteSecureAuthItems();
  try {
    await invalidateSubscriptionCaches(null);
  } catch {
    /* ignore */
  }
}

/** Только явная инвалидность токена — не сеть/таймаут/5xx. */
function isDefinitelyInvalidSession(err: unknown): boolean {
  return isAxiosError(err) && err.response?.status === 401;
}

function isTransientUserFetchError(err: unknown): boolean {
  if ((err as Error)?.message === 'timeout') return true;
  if (isAxiosError(err)) {
    if (!err.response) return true;
    const s = err.response.status;
    return s >= 500 || s === 408 || s === 429;
  }
  return false;
}

async function getStorageSnapshot(): Promise<{
  hasAsyncToken: boolean;
  hasSecureToken: boolean;
  storedRoleAsync: string | null;
}> {
  let hasSecureToken = false;
  let hasAsyncToken = false;
  let storedRoleAsync: string | null = null;
  try {
    const st = await peekSecureToken();
    hasSecureToken = !!st;
    const at = await withTimeout(AsyncStorage.getItem(TOKEN_KEY), 500);
    hasAsyncToken = !!at;
    const raw = await withTimeout(AsyncStorage.getItem(USER_KEY), 500);
    if (raw) {
      try {
        const u = JSON.parse(raw) as { role?: string };
        storedRoleAsync = typeof u?.role === 'string' ? u.role : null;
      } catch {}
    }
  } catch {}
  return { hasAsyncToken, hasSecureToken, storedRoleAsync };
}

async function logAuthStorageSnapshot(label: string): Promise<void> {
  if (!__DEV__ || !env.DEBUG_AUTH) return;
  const snapshot = await getStorageSnapshot();
  logger.debug('auth', 'AUTH_STORAGE_SNAPSHOT', label, { ...snapshot, storedRoleSecure: null });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pendingPhoneVerification, setPendingPhoneVerificationState] =
    useState<PendingPhoneVerification | null>(null);
  const [pendingVerificationNeedsLogin, setPendingVerificationNeedsLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const authContextInstanceIdRef = useRef(Math.random().toString(16).slice(2, 10));
  const isLoggingOutRef = useRef(false);
  const logoutPromiseRef = useRef<Promise<void> | null>(null);

  const cancelPendingPhoneVerification = useCallback(async () => {
    const verificationToken = pendingPhoneVerification?.verification_token;
    if (verificationToken) {
      await cancelSignupPhoneVerification(verificationToken).catch(() => undefined);
    }
    await clearPendingPhoneVerification();
    setPendingPhoneVerificationState(null);
    setPendingVerificationNeedsLogin(false);
  }, [pendingPhoneVerification]);

  const expirePendingPhoneVerification = useCallback(async () => {
    await clearPendingPhoneVerification();
    setPendingPhoneVerificationState(null);
    setPendingVerificationNeedsLogin(true);
  }, []);

  const beginPendingPhoneVerification = async (
    response: {
      verification_token: string;
      phone: string;
      expires_in: number;
      verification_kind: 'new_registration' | 'existing_account';
    },
    origin: PendingPhoneVerificationOrigin,
    registrationRole?: PendingPhoneVerificationRole
  ): Promise<PendingPhoneVerification> => {
    const pending: PendingPhoneVerification = {
      verification_token: response.verification_token,
      phone: response.phone,
      expires_at: Date.now() + response.expires_in * 1000,
      origin,
      verification_kind: response.verification_kind,
      ...(registrationRole ? { registration_role: registrationRole } : {}),
    };
    await clearAllAuthStorage('begin_pending_phone_verification');
    setToken(null);
    setUser(null);
    delete apiClient.defaults.headers.common['Authorization'];
    await setPendingPhoneVerification(pending);
    await setInstallMarker();
    await clearLogoutMarker();
    setPendingPhoneVerificationState(pending);
    setPendingVerificationNeedsLogin(false);
    return pending;
  };

  const clearAuth = useCallback(async (reason: 'logout' | 'invalid_token' = 'logout') => {
    if (logoutPromiseRef.current) {
      await logoutPromiseRef.current;
      return;
    }
    authTraceDestructive('clearAuth:entry', reason, token != null, '(no route in context)');
    void authTraceStorageSnapshot('clearAuth_before_marker');
    const promise = (async () => {
      isLoggingOutRef.current = true;
      try {
        if (reason === 'logout') {
          authTrace(`[clearAuth] setLogoutMarker(${reason})`);
          await setLogoutMarker(reason);
        } else {
          authTrace('[clearAuth] clearLogoutMarker (invalid_token path)');
          await clearLogoutMarker();
        }
        let userId: number | null = null;
        try {
          const raw = await AsyncStorage.getItem(USER_KEY);
          if (raw) {
            const u = JSON.parse(raw) as { id?: number };
            if (typeof u?.id === 'number') userId = u.id;
          }
        } catch {}
        authTrace(
          `[clearAuth] clearAllAuthStorage reason=${reason} preserveLogoutMarker=${reason === 'logout'}`
        );
        await clearAllAuthStorage(reason, { preserveLogoutMarker: reason === 'logout' });
        if (reason === 'logout') {
          await clearPendingPhoneVerification();
          setPendingPhoneVerificationState(null);
          setPendingVerificationNeedsLogin(false);
        }
        try {
          await invalidateSubscriptionCaches(userId);
          await invalidateSubscriptionCaches(null);
        } catch (error) {
          logger.error('Ошибка очистки авторизации:', error);
        }
        setToken(null);
        setUser(null);
        delete apiClient.defaults.headers.common['Authorization'];
        try {
          if (reason === 'logout') {
            analytics.track(AnalyticsEvent.Logout);
          }
          analytics.clearUser();
        } catch {
          /* analytics never breaks auth */
        }
        logAuthDiag('clearAuth done', { reason, clearedUserId: userId });
        if (__DEV__ && env.DEBUG_AUTH) await logAuthStorageSnapshot('after logout');
        void authTraceStorageSnapshot('clearAuth_done');
      } finally {
        isLoggingOutRef.current = false;
      }
    })();
    logoutPromiseRef.current = promise;
    await promise;
    logoutPromiseRef.current = null;
  }, [token]);

  useEffect(() => {
    registerInvalidSessionHandler(() => {
      void clearAuth('invalid_token');
    });
    return () => registerInvalidSessionHandler(null);
  }, [clearAuth]);

  useEffect(() => {
    authTrace(`[AuthProvider] MOUNT id=${authContextInstanceIdRef.current}`);
    logger.debug('auth', 'AUTH_CONTEXT_MOUNT', { authContextInstanceId: authContextInstanceIdRef.current });
    void authTraceStorageSnapshot('cold_mount');
    loadStoredAuth();
  }, []);

  useEffect(() => {
    if (token) {
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete apiClient.defaults.headers.common['Authorization'];
    }
  }, [token]);

  const loadStoredAuth = async (): Promise<void> => {
    if (isLoggingOutRef.current) {
      authTrace('[bootstrap] loadStoredAuth SKIP isLoggingOutRef=true');
      setIsLoading(false);
      return;
    }
    authTrace('[bootstrap] loadStoredAuth ENTRY');
    const installMarker = await readInstallMarker();
    let storedPending = await getPendingPhoneVerification();
    if (!installMarker && storedPending) {
      await clearPendingPhoneVerification();
      storedPending = null;
    }
    if (storedPending && isPendingPhoneVerificationExpired(storedPending)) {
      await clearPendingPhoneVerification();
      storedPending = null;
      setPendingVerificationNeedsLogin(true);
    } else {
      setPendingPhoneVerificationState(storedPending);
      setPendingVerificationNeedsLogin(false);
    }
    const peekToken = await peekSecureToken();
    const asyncTokenPeek = await withTimeout(AsyncStorage.getItem(TOKEN_KEY), 500).catch(() => null);
    if (!installMarker && (peekToken || asyncTokenPeek)) {
      authTraceDestructive(
        'loadStoredAuth_fresh_install',
        'install_marker_missing_with_token',
        true,
        '(bootstrap)'
      );
      await clearAllAuthStorage('fresh_install_orphan_keychain');
      await deleteSecureAuthItems();
      await clearPendingPhoneVerification();
      setPendingPhoneVerificationState(null);
      setToken(null);
      setUser(null);
      delete apiClient.defaults.headers.common['Authorization'];
      setIsLoading(false);
      return;
    }
    const logoutMarkerValue = await readLogoutMarker();
    authTrace(`[bootstrap] readLogoutMarker raw=${logoutMarkerValue ?? '(null/empty)'}`);
    if (logoutMarkerValue) {
      authTraceDestructive('loadStoredAuth_logout_marker', 'marker_present_blocks_restore', null, '(bootstrap)');
      void authTraceStorageSnapshot('before_clear_on_marker');
      if (__DEV__ && env.DEBUG_AUTH) {
        logger.debug('auth', '[LOGOUT_MARKER] restore blocked', {
          platform: Platform.OS,
          authContextInstanceId: authContextInstanceIdRef.current,
        });
      }
      await clearAllAuthStorage('logout_marker', { preserveLogoutMarker: false });
      await clearPendingPhoneVerification();
      setPendingPhoneVerificationState(null);
      setPendingVerificationNeedsLogin(false);
      setToken(null);
      setUser(null);
      delete apiClient.defaults.headers.common['Authorization'];
      setIsLoading(false);
      authTrace('[bootstrap] END after marker clear (logged out)');
      void authTraceStorageSnapshot('after_marker_clear');
      return;
    }
    if (initPromiseRef.current) {
      authTrace('[bootstrap] awaiting existing initPromise');
      await initPromiseRef.current;
      return;
    }
    const instanceId = authContextInstanceIdRef.current;
    const promise = (async () => {
      if (isLoggingOutRef.current) {
        setIsLoading(false);
        return;
      }
      await logAuthStorageSnapshot('before loadStoredAuth');
      void authTraceStorageSnapshot('inner_before_readToken');
      logger.debug('auth', '[Auth] loadStoredAuth start', { authContextInstanceId: instanceId });
      let storedToken: string | null = null;
      let meUser: User | null = null;
      try {
        if (isLoggingOutRef.current) {
          setIsLoading(false);
          return;
        }
        const cachedBefore = await loadCachedUser();
        storedToken = await readToken();
        await authTraceReadTokenHint('bootstrap_after_readToken');
        logAuthDiag('bootstrap start', {
          restoredToken: !!storedToken,
          cachedUser: userDiagFields(cachedBefore),
        });
        logger.debug('auth', '[Auth] loadStoredAuth token check', { hasToken: !!storedToken });

        if (storedToken && !isLoggingOutRef.current) {
          authTrace('[bootstrap] setToken(REDACTED_LEN=' + String(storedToken.length) + ')');
          setToken(storedToken);
          try {
            authTrace(
              `[me] GET /api/auth/users/me START bootstrap timeout_ms=${GET_USER_TIMEOUT_MS} effective_API=${env.API_URL}`
            );
            const userData = await withTimeout(getCurrentUser(), GET_USER_TIMEOUT_MS);
            meUser = userData;
            authTrace(`[me] GET /api/auth/users/me OK bootstrap userId=${userData.id} role=${userData.role}`);
            setUser(userData);
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
            await cancelPendingPhoneVerification();
            await invalidateSubscriptionCaches(userData.id);
            analytics.setUser({ id: userData.id, role: userData.role });
            logAuthDiag('/me OK (bootstrap)', {
              restoredToken: true,
              me: userDiagFields(userData),
            });
            logger.debug('auth', '[Auth] Session restored (cold start)', {
              userId: userData.id,
              role: userData.role,
            });
            await setInstallMarker();
          } catch (err: unknown) {
            if (isDefinitelyInvalidSession(err)) {
              authTrace('[me] GET /api/auth/users/me → 401 invalid_token → clearAuth');
              logger.info('auth', '[Auth] getCurrentUser 401 — токен недействителен');
              await clearAuth('invalid_token');
            } else if (isTransientUserFetchError(err)) {
              authTrace(
                `[me] GET /api/auth/users/me transient err=${(err as Error)?.message ?? '?'} status=${isAxiosError(err) ? err.response?.status : 'n/a'}`
              );
              logger.warn('auth', '[Auth] getCurrentUser transient (timeout/network/5xx), keep token', {
                platform: Platform.OS,
                message: (err as Error)?.message,
                status: isAxiosError(err) ? err.response?.status : undefined,
              });
              const cached = await loadCachedUser();
              if (cached) {
                meUser = cached;
                setUser(cached);
                await cancelPendingPhoneVerification();
                analytics.setUser({ id: cached.id, role: cached.role });
                logAuthDiag('/me transient → cached user (token kept)', {
                  restoredToken: true,
                  cachedUser: userDiagFields(cached),
                });
                logger.debug('auth', '[Auth] Restored user from AsyncStorage cache after transient error');
              } else {
                try {
                  await new Promise((r) => setTimeout(r, 500));
                  const retryUser = await withTimeout(getCurrentUser(), GET_USER_TIMEOUT_MS);
                  setUser(retryUser);
                  await AsyncStorage.setItem(USER_KEY, JSON.stringify(retryUser));
                  await cancelPendingPhoneVerification();
                  await invalidateSubscriptionCaches(retryUser.id);
                  logger.debug('auth', '[Auth] Session restored after retry getCurrentUser');
                } catch (err2: unknown) {
                  if (isDefinitelyInvalidSession(err2)) {
                    authTrace('[me] retry /me → 401 → clearAuth');
                    await clearAuth('invalid_token');
                  } else {
                    authTrace('[me] retry /me failed non-401 token_kept user_unset');
                    logger.warn('auth', '[Auth] Retry getCurrentUser failed; token kept, user unset', err2);
                  }
                }
              }
            } else {
              authTrace('[me] GET /api/auth/users/me other error → try cache');
              logger.warn('auth', '[Auth] getCurrentUser failed, keep token; try cache', err);
              const cached = await loadCachedUser();
              if (cached) {
                meUser = cached;
                setUser(cached);
                await cancelPendingPhoneVerification();
                logAuthDiag('/me error → cached user (token kept)', {
                  restoredToken: true,
                  cachedUser: userDiagFields(cached),
                });
              }
            }
          }
        } else {
          authTrace('[bootstrap] no storedToken → stay logged out');
          const cached = await loadCachedUser();
          logAuthDiag('bootstrap no token — clear orphan cache', {
            restoredToken: false,
            cachedUser: userDiagFields(cached),
          });
          await clearOrphanUserAndFeatureCaches();
          setToken(null);
          setUser(null);
          delete apiClient.defaults.headers.common['Authorization'];
        }
      } catch (error) {
        authTrace(`[bootstrap] loadStoredAuth outer catch ${error instanceof Error ? error.message : String(error)}`);
        logger.error('Ошибка загрузки сохраненной авторизации:', error);
      } finally {
        setIsLoading(false);
        authTrace(
          `[bootstrap] loadStoredAuth FINALLY isLoading=false token_in_state=(see next snapshot) instance=${instanceId}`
        );
        logger.debug('auth', '[Auth] loadStoredAuth end', { isLoading: false, authContextInstanceId: instanceId });
        await logAuthStorageSnapshot('after loadStoredAuth');
        void authTraceStorageSnapshot('after_loadStoredAuth_finally');
        logAuthDiag('bootstrap end', {
          restoredToken: !!storedToken,
          me: userDiagFields(meUser),
          finalUser: userDiagFields(meUser),
        });
      }
    })();
    initPromiseRef.current = promise;
    await promise;
  };

  const retryInit = async () => {
    initPromiseRef.current = null;
    setIsLoading(true);
    logger.debug('auth', '[Auth] retryInit', { authContextInstanceId: authContextInstanceIdRef.current });
    await loadStoredAuth();
  };

  const saveTokens = async (
    response: AuthenticatedResponse,
    reason: 'login' | 'register' = 'login'
  ) => {
    const newToken = response.access_token;
    try {
      authTrace(`[saveToken] clearAllAuthStorage(before_write) next_reason=${reason} new_token_len=${newToken.length}`);
      // Перед записью токена чистим старые auth-ключи (legacy/маркеры/юзер) в одном месте,
      // чтобы не было рассинхрона между Android/iOS из-за остатков в AsyncStorage/SecureStore.
      await clearAllAuthStorage('before_write');
      await writeToken(newToken, isLoggingOutRef, reason);
      await writeRefreshToken(response.refresh_token, isLoggingOutRef);
      if (isLoggingOutRef.current) return;
      await setInstallMarker();
      setToken(newToken);
    } catch (error) {
      logger.error('Ошибка сохранения токена:', error);
      if (!isLoggingOutRef.current) {
        await AsyncStorage.setItem(TOKEN_KEY, newToken);
        await AsyncStorage.setItem(AUTH_REFRESH_TOKEN_KEY, response.refresh_token);
        setToken(newToken);
      }
    }
  };

  const login = async (credentials: LoginCredentials): Promise<AuthFlowResult> => {
    try {
      const response = await apiLogin(credentials);
      if (isPhoneVerificationRequiredResponse(response)) {
        const pending = await beginPendingPhoneVerification(response, 'login');
        return { status: 'phone_verification_required', pending };
      }
      if (!isAuthenticatedResponse(response)) {
        throw new Error('Сервер не вернул полноценную auth-сессию');
      }
      await saveTokens(response, 'login');
      try {
        const userData = await getCurrentUser();
        setUser(userData);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
        await cancelPendingPhoneVerification();
        await invalidateSubscriptionCaches(userData.id);
        await clearLogoutMarker();
        analytics.setUser({ id: userData.id, role: userData.role });
        analytics.track(AnalyticsEvent.AuthPhoneSuccess, { authMethod: 'phone' });
        void authTraceStorageSnapshot('after_login_success');
        logAuthDiag('login success', { restoredToken: true, me: userDiagFields(userData) });
        logger.debug('auth', '🔑 [Auth] Login success', { userId: userData.id, phone: userData.phone, role: userData.role });
        return { status: 'authenticated', user: userData };
      } catch (error) {
        logger.error('Ошибка загрузки данных пользователя:', error);
        const userData = response.user ? (response.user as User) : null;
        if (userData) {
          setUser(userData);
          analytics.setUser({ id: userData.id, role: userData.role });
          analytics.track(AnalyticsEvent.AuthPhoneSuccess, { authMethod: 'phone' });
        }
        await clearLogoutMarker();
        void authTraceStorageSnapshot('after_login_partial_user');
        if (userData) await cancelPendingPhoneVerification();
        return { status: 'authenticated', user: userData };
      }
    } catch (error: unknown) {
      logger.error('Ошибка входа:', error);
      throw error;
    }
  };

  const register = async (credentials: RegisterCredentials): Promise<AuthFlowResult> => {
    try {
      const response = await apiRegister(credentials);
      if (isPhoneVerificationRequiredResponse(response)) {
        const role: PendingPhoneVerificationRole =
          credentials.role === 'master' ? 'master' : 'client';
        const pending = await beginPendingPhoneVerification(response, 'register', role);
        return { status: 'phone_verification_required', pending };
      }
      if (!isAuthenticatedResponse(response)) {
        throw new Error('Сервер не вернул полноценную auth-сессию');
      }
      await saveTokens(response, 'register');
      try {
        const userData = await getCurrentUser();
        setUser(userData);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
        await cancelPendingPhoneVerification();
        await invalidateSubscriptionCaches(userData.id);
        await clearLogoutMarker();
        analytics.setUser({ id: userData.id, role: userData.role });
        analytics.track(AnalyticsEvent.RegistrationCompleted, { authMethod: 'phone' });
        if (userData.role) {
          analytics.track(AnalyticsEvent.RoleSelected, { role: userData.role });
        }
        void authTraceStorageSnapshot('after_register_success');
        logger.debug('auth', '🔑 [Auth] Register success', { userId: userData.id, phone: userData.phone, role: userData.role });
        return { status: 'authenticated', user: userData };
      } catch (error) {
        logger.error('Ошибка загрузки данных пользователя:', error);
        if (response.user) {
          const u = response.user as User;
          setUser(u);
          analytics.setUser({ id: u.id, role: u.role });
          analytics.track(AnalyticsEvent.RegistrationCompleted, { authMethod: 'phone' });
          await cancelPendingPhoneVerification();
        }
        await clearLogoutMarker();
        return { status: 'authenticated', user: response.user ? (response.user as User) : null };
      }
    } catch (error: unknown) {
      logger.error('Ошибка регистрации:', error);
      throw error;
    }
  };

  const completePhoneVerification = async (
    response: AuthenticatedResponse
  ): Promise<User> => {
    const pending = pendingPhoneVerification;
    if (!pending) {
      throw new Error('Сессия подтверждения телефона не найдена');
    }
    try {
      await saveTokens(response, pending.origin === 'register' ? 'register' : 'login');
      const userData = await withTimeout(getCurrentUser(), GET_USER_TIMEOUT_MS);
      setUser(userData);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
      await invalidateSubscriptionCaches(userData.id);
      await clearLogoutMarker();
      analytics.setUser({ id: userData.id, role: userData.role });
      if (pending.origin === 'register') {
        analytics.track(AnalyticsEvent.RegistrationCompleted, { authMethod: 'phone' });
        if (userData.role) analytics.track(AnalyticsEvent.RoleSelected, { role: userData.role });
      } else {
        analytics.track(AnalyticsEvent.AuthPhoneSuccess, { authMethod: 'phone' });
      }
      await cancelPendingPhoneVerification();
      return userData;
    } catch (error) {
      await clearAllAuthStorage('phone_verification_hydration_failed');
      await clearPendingPhoneVerification();
      setToken(null);
      setUser(null);
      setPendingPhoneVerificationState(null);
      setPendingVerificationNeedsLogin(true);
      delete apiClient.defaults.headers.common['Authorization'];
      throw error;
    }
  };

  const logout = async () => {
    await clearAuth();
  };

  const ensureNoTokenOnLogin = async () => {
    authTrace('[ensureNoTokenOnLogin] INVOKED (AuthGate)');
    const t = await readToken();
    if (!t) {
      authTrace('[ensureNoTokenOnLogin] no token in storage → noop');
      const cached = await loadCachedUser();
      if (cached) {
        logAuthDiag('ensureNoTokenOnLogin — clear orphan user cache', {
          cachedUser: userDiagFields(cached),
        });
        await clearOrphanUserAndFeatureCaches();
      }
      return;
    }
    authTraceDestructive('ensureNoTokenOnLogin', 'invariant_login_with_token', true, '/login');
    const snapshotBefore = await getStorageSnapshot();
    if (__DEV__) {
      logger.warn('auth', '[AUTH INVARIANT] On /login but token exists. Clearing…', snapshotBefore);
    }
    await logAuthStorageSnapshot('ensureNoTokenOnLogin before');
    isLoggingOutRef.current = true;
    try {
      await setLogoutMarker('ensureNoTokenOnLogin');
      await clearAllAuthStorage('ensureNoTokenOnLogin', { preserveLogoutMarker: true });
      setToken(null);
      setUser(null);
      delete apiClient.defaults.headers.common['Authorization'];
    } finally {
      isLoggingOutRef.current = false;
    }
    await logAuthStorageSnapshot('ensureNoTokenOnLogin after');
  };

  const refreshUser = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
      await invalidateSubscriptionCaches(userData.id);
    } catch (error: unknown) {
      logger.error('Ошибка обновления данных пользователя:', error);
      if ((error as { response?: { status?: number } })?.response?.status === 401) {
        await logout();
      }
    }
  };

  const value: AuthContextType = {
    user,
    token,
    pendingPhoneVerification,
    pendingVerificationNeedsLogin,
    isLoading,
    isAuthenticated: !!token && !!user,
    login,
    register,
    completePhoneVerification,
    cancelPendingPhoneVerification,
    expirePendingPhoneVerification,
    logout,
    refreshUser,
    retryInit,
    ensureNoTokenOnLogin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
