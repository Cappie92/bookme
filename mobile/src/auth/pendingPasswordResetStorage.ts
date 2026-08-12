import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { withTimeout } from '@src/utils/promiseWithTimeout';

const STORAGE_TIMEOUT_MS = 3000;
export const PENDING_PASSWORD_RESET_KEY = 'pending_password_reset_v1';

export type PendingPasswordReset =
  | {
      stage: 'verification';
      phone: string;
      challenge_token: string;
      call_id: string;
      expires_at: number;
    }
  | {
      stage: 'new_password';
      reset_token: string;
      expires_at: number;
    };

const isExpoGo = Constants.appOwnership === 'expo';
let SecureStore: any = null;
if (!isExpoGo) {
  try {
    SecureStore = require('expo-secure-store');
  } catch {
    /* AsyncStorage fallback */
  }
}

function parsePendingPasswordReset(raw: string | null): PendingPasswordReset | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof value.expires_at !== 'number' ||
      !Number.isFinite(value.expires_at)
    ) {
      return null;
    }
    if (
      value.stage === 'verification' &&
      typeof value.phone === 'string' &&
      value.phone.length > 0 &&
      typeof value.challenge_token === 'string' &&
      value.challenge_token.length > 0 &&
      typeof value.call_id === 'string' &&
      value.call_id.length > 0
    ) {
      return value as unknown as PendingPasswordReset;
    }
    if (
      value.stage === 'new_password' &&
      typeof value.reset_token === 'string' &&
      value.reset_token.length > 0
    ) {
      return value as unknown as PendingPasswordReset;
    }
    return null;
  } catch {
    return null;
  }
}

export function isPendingPasswordResetExpired(
  pending: PendingPasswordReset,
  now: number = Date.now()
): boolean {
  return pending.expires_at <= now;
}

export async function getPendingPasswordReset(): Promise<PendingPasswordReset | null> {
  let raw: string | null = null;
  if (!isExpoGo && SecureStore) {
    try {
      raw = await withTimeout(SecureStore.getItemAsync(PENDING_PASSWORD_RESET_KEY), STORAGE_TIMEOUT_MS);
    } catch {
      /* AsyncStorage fallback */
    }
  }
  if (!raw) {
    try {
      raw = await withTimeout(AsyncStorage.getItem(PENDING_PASSWORD_RESET_KEY), STORAGE_TIMEOUT_MS);
    } catch {
      return null;
    }
  }
  const parsed = parsePendingPasswordReset(raw);
  if (!parsed && raw) await clearPendingPasswordReset();
  return parsed;
}

export async function setPendingPasswordReset(pending: PendingPasswordReset): Promise<void> {
  const serialized = JSON.stringify(pending);
  await AsyncStorage.setItem(PENDING_PASSWORD_RESET_KEY, serialized);
  if (!isExpoGo && SecureStore) {
    try {
      await SecureStore.setItemAsync(PENDING_PASSWORD_RESET_KEY, serialized);
    } catch {
      /* AsyncStorage remains the fallback */
    }
  }
}

export async function clearPendingPasswordReset(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_PASSWORD_RESET_KEY);
  } catch {
    /* ignore */
  }
  if (!isExpoGo && SecureStore) {
    try {
      await SecureStore.deleteItemAsync(PENDING_PASSWORD_RESET_KEY);
    } catch {
      /* ignore */
    }
  }
}
