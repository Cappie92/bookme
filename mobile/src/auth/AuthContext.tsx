import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { isAxiosError } from 'axios';
import { login as apiLogin, register as apiRegister, getCurrentUser, LoginCredentials, RegisterCredentials, User } from '@src/services/api/auth';
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
  AUTH_LOGOUT_MARKER,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  clearLogoutMarker,
  deleteSecureAuthItems,
  peekSecureToken,
  readLogoutMarker,
  readToken,
  setLogoutMarker,
  writeToken,
} from '@src/auth/tokenStorage';

const GET_USER_TIMEOUT_MS = 8000;

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<User | null>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Повторная попытка загрузки сессии (для failsafe) */
  retryInit: () => Promise<void>;
  /** Инвариант: на /login токена в storage быть не должно. Вызвать при отображении экрана логина. */
  ensureNoTokenOnLogin: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    AUTH_USER_KEY,
    AUTH_LOGOUT_MARKER,
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
  const [isLoading, setIsLoading] = useState(true);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const authContextInstanceIdRef = useRef(Math.random().toString(16).slice(2, 10));
  const isLoggingOutRef = useRef(false);
  const logoutPromiseRef = useRef<Promise<void> | null>(null);

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
      try {
        if (isLoggingOutRef.current) {
          setIsLoading(false);
          return;
        }
        const storedToken = await readToken();
        await authTraceReadTokenHint('bootstrap_after_readToken');
        logger.debug('auth', '[Auth] loadStoredAuth token check', { hasToken: !!storedToken });

        if (storedToken && !isLoggingOutRef.current) {
          authTrace('[bootstrap] setToken(REDACTED_LEN=' + String(storedToken.length) + ')');
          setToken(storedToken);
          try {
            authTrace(
              `[me] GET /api/auth/users/me START bootstrap timeout_ms=${GET_USER_TIMEOUT_MS} effective_API=${env.API_URL}`
            );
            const userData = await withTimeout(getCurrentUser(), GET_USER_TIMEOUT_MS);
            authTrace(`[me] GET /api/auth/users/me OK bootstrap userId=${userData.id} role=${userData.role}`);
            setUser(userData);
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
            await invalidateSubscriptionCaches(userData.id);
            logger.debug('auth', '[Auth] Session restored (cold start)', {
              userId: userData.id,
              role: userData.role,
            });
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
                setUser(cached);
                logger.debug('auth', '[Auth] Restored user from AsyncStorage cache after transient error');
              } else {
                try {
                  await new Promise((r) => setTimeout(r, 500));
                  const retryUser = await withTimeout(getCurrentUser(), GET_USER_TIMEOUT_MS);
                  setUser(retryUser);
                  await AsyncStorage.setItem(USER_KEY, JSON.stringify(retryUser));
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
                setUser(cached);
              }
            }
          }
        } else {
          authTrace('[bootstrap] no storedToken → stay logged out');
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

  const clearAuth = async (reason: 'logout' | 'invalid_token' = 'logout') => {
    if (logoutPromiseRef.current) {
      await logoutPromiseRef.current;
      return;
    }
    authTraceDestructive('clearAuth:entry', reason, token != null, '(no route in context)');
    void authTraceStorageSnapshot('clearAuth_before_marker');
    const promise = (async () => {
      isLoggingOutRef.current = true;
      try {
        // Для invalid_token не оставляем marker "висеть" между запусками: иначе можно получить полу-разлогин на Android.
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
        try {
          await invalidateSubscriptionCaches(userId);
        } catch (error) {
          logger.error('Ошибка очистки авторизации:', error);
        }
        setToken(null);
        setUser(null);
        delete apiClient.defaults.headers.common['Authorization'];
        if (__DEV__ && env.DEBUG_AUTH) await logAuthStorageSnapshot('after logout');
        void authTraceStorageSnapshot('clearAuth_done');
      } finally {
        isLoggingOutRef.current = false;
      }
    })();
    logoutPromiseRef.current = promise;
    await promise;
    logoutPromiseRef.current = null;
  };

  const saveToken = async (newToken: string, reason: 'login' | 'register' = 'login') => {
    try {
      authTrace(`[saveToken] clearAllAuthStorage(before_write) next_reason=${reason} new_token_len=${newToken.length}`);
      // Перед записью токена чистим старые auth-ключи (legacy/маркеры/юзер) в одном месте,
      // чтобы не было рассинхрона между Android/iOS из-за остатков в AsyncStorage/SecureStore.
      await clearAllAuthStorage('before_write');
      await writeToken(newToken, isLoggingOutRef, reason);
      if (isLoggingOutRef.current) return;
      setToken(newToken);
    } catch (error) {
      logger.error('Ошибка сохранения токена:', error);
      if (!isLoggingOutRef.current) {
        await AsyncStorage.setItem(TOKEN_KEY, newToken);
        setToken(newToken);
      }
    }
  };

  const login = async (credentials: LoginCredentials): Promise<User | null> => {
    try {
      const response = await apiLogin(credentials);
      await saveToken(response.access_token, 'login');
      try {
        const userData = await getCurrentUser();
        setUser(userData);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
        await invalidateSubscriptionCaches(userData.id);
        await clearLogoutMarker();
        void authTraceStorageSnapshot('after_login_success');
        logger.debug('auth', '🔑 [Auth] Login success', { userId: userData.id, phone: userData.phone, role: userData.role });
        return userData;
      } catch (error) {
        logger.error('Ошибка загрузки данных пользователя:', error);
        const userData = response.user ? (response.user as User) : null;
        if (userData) setUser(userData);
        await clearLogoutMarker();
        void authTraceStorageSnapshot('after_login_partial_user');
        return userData;
      }
    } catch (error: unknown) {
      logger.error('Ошибка входа:', error);
      throw error;
    }
  };

  const register = async (credentials: RegisterCredentials) => {
    try {
      const response = await apiRegister(credentials);
      await saveToken(response.access_token, 'register');
      try {
        const userData = await getCurrentUser();
        setUser(userData);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
        await invalidateSubscriptionCaches(userData.id);
        await clearLogoutMarker();
        void authTraceStorageSnapshot('after_register_success');
        logger.debug('auth', '🔑 [Auth] Register success', { userId: userData.id, phone: userData.phone, role: userData.role });
      } catch (error) {
        logger.error('Ошибка загрузки данных пользователя:', error);
        if (response.user) {
          setUser(response.user as User);
        }
        await clearLogoutMarker();
      }
    } catch (error: unknown) {
      logger.error('Ошибка регистрации:', error);
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
    isLoading,
    isAuthenticated: !!token && !!user,
    login,
    register,
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

