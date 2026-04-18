import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { withTimeout } from '@src/utils/promiseWithTimeout';
import { logger } from '@src/utils/logger';
import { env } from '@src/config/env';

const STORAGE_TIMEOUT_MS = 3000;
const LOGOUT_MARKER_TIMEOUT_MS = 1000;

export const AUTH_TOKEN_KEY = 'access_token';
export const AUTH_USER_KEY = 'user_data';
export const AUTH_LOGOUT_MARKER = 'auth_logout_marker';

// SecureStore в Expo Go может зависать (Keychain на симуляторе). Пропускаем.
const isExpoGo = Constants.appOwnership === 'expo';
let SecureStore: any = null;
if (!isExpoGo) {
  try {
    SecureStore = require('expo-secure-store');
  } catch {
    /* ignore */
  }
}

export async function peekSecureToken(): Promise<string | null> {
  if (isExpoGo) return null;
  if (!SecureStore) return null;
  try {
    const t = await withTimeout(SecureStore.getItemAsync(AUTH_TOKEN_KEY), 500);
    return t || null;
  } catch {
    return null;
  }
}

export async function deleteSecureAuthItems(): Promise<void> {
  if (isExpoGo) return;
  if (!SecureStore) return;
  for (const k of [AUTH_TOKEN_KEY, AUTH_USER_KEY]) {
    try {
      await SecureStore.deleteItemAsync(k);
    } catch {
      /* ignore */
    }
  }
}

export async function readLogoutMarker(): Promise<string | null> {
  try {
    const v = await withTimeout(AsyncStorage.getItem(AUTH_LOGOUT_MARKER), LOGOUT_MARKER_TIMEOUT_MS);
    if (__DEV__ && env.DEBUG_AUTH && v) logger.debug('auth', '[LOGOUT_MARKER] read', { value: v });
    return v;
  } catch {
    return null;
  }
}

export async function setLogoutMarker(reason?: string): Promise<void> {
  const value = `${Date.now()}`;
  await AsyncStorage.setItem(AUTH_LOGOUT_MARKER, value);
  if (__DEV__ && env.DEBUG_AUTH) logger.debug('auth', '[LOGOUT_MARKER] set', { reason: reason ?? 'unknown' });
}

export async function clearLogoutMarker(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_LOGOUT_MARKER);
  if (__DEV__ && env.DEBUG_AUTH) logger.debug('auth', '[LOGOUT_MARKER] cleared');
}

/** Единый источник истины: Expo Go → только AsyncStorage; иначе → SecureStore (fallback AsyncStorage при чтении). */
export async function readToken(): Promise<string | null> {
  if (isExpoGo) {
    try {
      return await withTimeout(AsyncStorage.getItem(AUTH_TOKEN_KEY), STORAGE_TIMEOUT_MS);
    } catch {
      return null;
    }
  }
  if (SecureStore) {
    try {
      const t = await withTimeout(SecureStore.getItemAsync(AUTH_TOKEN_KEY), STORAGE_TIMEOUT_MS);
      if (t) return t;
    } catch {
      /* timeout or error */
    }
  }
  try {
    return await withTimeout(AsyncStorage.getItem(AUTH_TOKEN_KEY), STORAGE_TIMEOUT_MS);
  } catch {
    return null;
  }
}

/** Пишем только в источник истины, но дублируем в AsyncStorage для надёжности восстановления на Android. */
export async function writeToken(
  token: string,
  isLoggingOutRef: { current: boolean },
  reason: 'login' | 'register' | 'unknown' = 'unknown'
): Promise<void> {
  if (isLoggingOutRef.current) return;
  if (isExpoGo) {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
    return;
  }
  if (SecureStore) {
    try {
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
      try {
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
      } catch {
        /* ignore */
      }
      return;
    } catch {
      // fallback below
    }
  }
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  if (__DEV__ && env.DEBUG_AUTH) logger.debug('auth', '[TOKEN] write fallback AsyncStorage', { reason });
}

