import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { withTimeout } from '@src/utils/promiseWithTimeout';

export const INSTALLATION_ID_STORAGE_KEY = 'dedato_install_id_v1';

const STORAGE_TIMEOUT_MS = 3000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isExpoGo = Constants.appOwnership === 'expo';

let memoryInstallationId: string | null = null;
let SecureStore: { getItemAsync: (k: string) => Promise<string | null>; setItemAsync: (k: string, v: string) => Promise<void> } | null =
  null;

if (!isExpoGo) {
  try {
    SecureStore = require('expo-secure-store');
  } catch {
    SecureStore = null;
  }
}

function randomUuidV4(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isValidInstallationId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

async function readStoredInstallationId(): Promise<string | null> {
  if (SecureStore) {
    try {
      const fromSecure = await withTimeout(
        SecureStore.getItemAsync(INSTALLATION_ID_STORAGE_KEY) as Promise<string | null>,
        STORAGE_TIMEOUT_MS
      );
      if (isValidInstallationId(fromSecure)) return fromSecure.trim();
    } catch {
      /* timeout or store error — try AsyncStorage */
    }
  }
  try {
    const fromAsync = await withTimeout(
      AsyncStorage.getItem(INSTALLATION_ID_STORAGE_KEY),
      STORAGE_TIMEOUT_MS
    );
    if (isValidInstallationId(fromAsync)) return fromAsync.trim();
  } catch {
    /* ignore */
  }
  return null;
}

async function persistInstallationId(id: string): Promise<void> {
  if (SecureStore) {
    try {
      await withTimeout(SecureStore.setItemAsync(INSTALLATION_ID_STORAGE_KEY, id), STORAGE_TIMEOUT_MS);
      try {
        await AsyncStorage.setItem(INSTALLATION_ID_STORAGE_KEY, id);
      } catch {
        /* mirror is best-effort */
      }
      return;
    } catch {
      /* fallback below */
    }
  }
  await withTimeout(AsyncStorage.setItem(INSTALLATION_ID_STORAGE_KEY, id), STORAGE_TIMEOUT_MS);
}

/**
 * Privacy-safe install UUID (not IDFA / Android ID / user id / Expo token).
 * Reinstall may keep Keychain value on iOS — backend must tolerate reuse.
 */
export async function peekInstallationId(): Promise<string | null> {
  if (isValidInstallationId(memoryInstallationId)) return memoryInstallationId;
  const stored = await readStoredInstallationId();
  if (stored) {
    memoryInstallationId = stored;
    return stored;
  }
  return null;
}

export async function getOrCreateInstallationId(): Promise<string> {
  const existing = await peekInstallationId();
  if (existing) return existing;
  const created = randomUuidV4();
  memoryInstallationId = created;
  try {
    await persistInstallationId(created);
  } catch {
    /* in-memory id still usable this session */
  }
  return created;
}

export function __resetInstallationIdentityCacheForTests(): void {
  memoryInstallationId = null;
}
