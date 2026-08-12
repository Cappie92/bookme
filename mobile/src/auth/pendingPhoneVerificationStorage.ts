import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { withTimeout } from '@src/utils/promiseWithTimeout';

const STORAGE_TIMEOUT_MS = 3000;
export const PENDING_PHONE_VERIFICATION_KEY = 'pending_phone_verification_v1';

export type PendingPhoneVerificationOrigin = 'register' | 'login';
export type PendingPhoneVerificationRole = 'client' | 'master';

export interface PendingPhoneVerification {
  verification_token: string;
  phone: string;
  expires_at: number;
  origin: PendingPhoneVerificationOrigin;
  registration_role?: PendingPhoneVerificationRole;
  verification_kind: 'new_registration' | 'existing_account';
}

const isExpoGo = Constants.appOwnership === 'expo';
let SecureStore: any = null;
if (!isExpoGo) {
  try {
    SecureStore = require('expo-secure-store');
  } catch {
    /* AsyncStorage fallback */
  }
}

function parsePendingPhoneVerification(raw: string | null): PendingPhoneVerification | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof value.verification_token !== 'string' ||
      value.verification_token.length === 0 ||
      typeof value.phone !== 'string' ||
      value.phone.length === 0 ||
      typeof value.expires_at !== 'number' ||
      !Number.isFinite(value.expires_at) ||
      (value.origin !== 'register' && value.origin !== 'login') ||
      (value.verification_kind !== 'new_registration' &&
        value.verification_kind !== 'existing_account') ||
      (value.origin === 'register' && value.verification_kind !== 'new_registration') ||
      (value.origin === 'login' && value.verification_kind !== 'existing_account') ||
      (value.registration_role !== undefined &&
        value.registration_role !== 'client' &&
        value.registration_role !== 'master')
    ) {
      return null;
    }
    return value as unknown as PendingPhoneVerification;
  } catch {
    return null;
  }
}

export function isPendingPhoneVerificationExpired(
  pending: PendingPhoneVerification,
  now: number = Date.now()
): boolean {
  return pending.expires_at <= now;
}

export async function getPendingPhoneVerification(): Promise<PendingPhoneVerification | null> {
  let raw: string | null = null;
  if (!isExpoGo && SecureStore) {
    try {
      raw = await withTimeout(
        SecureStore.getItemAsync(PENDING_PHONE_VERIFICATION_KEY),
        STORAGE_TIMEOUT_MS
      );
    } catch {
      /* AsyncStorage fallback */
    }
  }
  if (!raw) {
    try {
      raw = await withTimeout(
        AsyncStorage.getItem(PENDING_PHONE_VERIFICATION_KEY),
        STORAGE_TIMEOUT_MS
      );
    } catch {
      return null;
    }
  }
  const parsed = parsePendingPhoneVerification(raw);
  if (!parsed && raw) await clearPendingPhoneVerification();
  return parsed;
}

export async function setPendingPhoneVerification(
  pending: PendingPhoneVerification
): Promise<void> {
  const serialized = JSON.stringify(pending);
  await AsyncStorage.setItem(PENDING_PHONE_VERIFICATION_KEY, serialized);
  if (!isExpoGo && SecureStore) {
    try {
      await SecureStore.setItemAsync(PENDING_PHONE_VERIFICATION_KEY, serialized);
    } catch {
      /* AsyncStorage remains the fallback */
    }
  }
}

export async function clearPendingPhoneVerification(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_PHONE_VERIFICATION_KEY);
  } catch {
    /* ignore */
  }
  if (!isExpoGo && SecureStore) {
    try {
      await SecureStore.deleteItemAsync(PENDING_PHONE_VERIFICATION_KEY);
    } catch {
      /* ignore */
    }
  }
}
