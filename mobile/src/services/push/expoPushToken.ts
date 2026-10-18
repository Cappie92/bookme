import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { withTimeout } from '@src/utils/promiseWithTimeout';

const TOKEN_RE = /^[A-Za-z0-9_.:\[\]-]{16,512}$/;
const EXPO_TOKEN_SHAPE_RE = /^(?:Exponent|Expo)PushToken\[[^\]]+\]$/;
const REPLACED_SENTINEL_RE = /^replaced:\d+$/;
const NATIVE_TOKEN_RE = /^[A-Za-z0-9_.:-]{16,512}$/;

export type ExpoPushTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'missing_project_id' | 'unavailable' | 'invalid_token' | 'simulator' };

export type NativeDevicePushToken = {
  type: 'ios' | 'android';
  data: string;
};

type ConstantsWithEas = {
  easConfig?: { projectId?: string };
  expoConfig?: { extra?: { eas?: { projectId?: string } } };
};

type NativeAcquireSlot = {
  invalidated: boolean;
  settled: boolean;
  underlying: Promise<ExpoPushTokenResult>;
};

/**
 * Bounds the app-level wait. It does not cancel the underlying native call:
 * expo-notifications 0.32 keeps that promise inside getDevicePushTokenAsync.
 */
export const EXPO_PUSH_TOKEN_ACQUISITION_TIMEOUT_MS = 10_000;

let appWait: Promise<ExpoPushTokenResult> | null = null;
let nativeSlot: NativeAcquireSlot | null = null;

export function resolveEasProjectId(): string | null {
  const constants = Constants as ConstantsWithEas;
  const id =
    constants.easConfig?.projectId ||
    constants.expoConfig?.extra?.eas?.projectId ||
    null;
  if (typeof id === 'string' && id.trim()) return id.trim();
  return null;
}

export function isPlausibleExpoPushToken(token: string): boolean {
  const trimmed = token.trim();
  return EXPO_TOKEN_SHAPE_RE.test(trimmed) && TOKEN_RE.test(trimmed) && !REPLACED_SENTINEL_RE.test(trimmed);
}

export function expoPushTokenSuffixForDiag(token: string): string {
  const trimmed = token.trim();
  return trimmed.slice(-6);
}

/**
 * Listener payload from expo-notifications 0.32:
 * `{ type: Platform.OS, data: nativeDeviceTokenString }`.
 * That string is APNs or FCM, never an Expo token.
 */
export function readNativeDevicePushToken(payload: unknown): NativeDevicePushToken | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { type?: unknown; data?: unknown };
  if (record.type !== 'ios' && record.type !== 'android') return null;
  if (record.type !== Platform.OS) return null;
  if (typeof record.data !== 'string') return null;
  const data = record.data.trim();
  if (!NATIVE_TOKEN_RE.test(data) || EXPO_TOKEN_SHAPE_RE.test(data)) return null;
  return { type: record.type, data };
}

function isTimedOutNativeAcquireUnresolved(): boolean {
  return nativeSlot != null && nativeSlot.invalidated && !nativeSlot.settled;
}

function parseExpoTokenResult(result: { data?: unknown } | null): ExpoPushTokenResult {
  if (!result) return { ok: false, reason: 'unavailable' };
  const token = typeof result.data === 'string' ? result.data.trim() : '';
  if (!isPlausibleExpoPushToken(token)) return { ok: false, reason: 'invalid_token' };
  return { ok: true, token };
}

function simulatorOrProjectGate(): ExpoPushTokenResult | null {
  if (Platform.OS === 'ios' && !Device.isDevice) return { ok: false, reason: 'simulator' };
  if (!resolveEasProjectId()) return { ok: false, reason: 'missing_project_id' };
  return null;
}

/**
 * Initial acquisition. Omitting devicePushToken lets the SDK obtain the native
 * token. A second call is not started while that underlying promise is still
 * open after a timeout.
 */
export async function acquireExpoPushToken(): Promise<ExpoPushTokenResult> {
  const blocked = simulatorOrProjectGate();
  if (blocked) return blocked;
  if (isTimedOutNativeAcquireUnresolved()) return { ok: false, reason: 'unavailable' };
  if (appWait) return appWait;

  const projectId = resolveEasProjectId() as string;
  const slot: NativeAcquireSlot = {
    invalidated: false,
    settled: false,
    underlying: Promise.resolve({ ok: false, reason: 'unavailable' }),
  };
  const underlying = Notifications.getExpoPushTokenAsync({ projectId }).then(
    (result) => parseExpoTokenResult(result),
    () => ({ ok: false, reason: 'unavailable' }) as ExpoPushTokenResult,
  );
  slot.underlying = underlying;
  nativeSlot = slot;
  underlying.finally(() => {
    slot.settled = true;
    if (nativeSlot === slot) nativeSlot = null;
  });

  let pending!: Promise<ExpoPushTokenResult>;
  pending = withTimeout(underlying, EXPO_PUSH_TOKEN_ACQUISITION_TIMEOUT_MS).then(
    (result) => result,
    () => {
      slot.invalidated = true;
      return { ok: false, reason: 'unavailable' } as ExpoPushTokenResult;
    },
  ).finally(() => {
    if (appWait === pending) appWait = null;
  });
  appWait = pending;
  return pending;
}

/**
 * Converts an already obtained native token. Passes devicePushToken through,
 * which in expo-notifications 0.32 skips getDevicePushTokenAsync.
 */
export async function convertNativeDeviceToExpoPushToken(
  devicePushToken: NativeDevicePushToken,
): Promise<ExpoPushTokenResult> {
  const blocked = simulatorOrProjectGate();
  if (blocked) return blocked;
  if (devicePushToken.type !== Platform.OS) return { ok: false, reason: 'unavailable' };
  const projectId = resolveEasProjectId() as string;
  const conversion = Notifications.getExpoPushTokenAsync({
    projectId,
    devicePushToken,
  }).then(
    (result) => parseExpoTokenResult(result),
    () => ({ ok: false, reason: 'unavailable' }) as ExpoPushTokenResult,
  );
  try {
    return await withTimeout(conversion, EXPO_PUSH_TOKEN_ACQUISITION_TIMEOUT_MS);
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export function __resetExpoPushTokenFlightForTests(): void {
  appWait = null;
  nativeSlot = null;
}
