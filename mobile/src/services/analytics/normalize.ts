import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { AnalyticsCommonContext, AnalyticsPrimitive, AnalyticsProperties } from './types';

function readAppVersion(): string {
  return (
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '1.0.0'
  );
}

function readBuildNumber(): string {
  const ios = Constants.expoConfig?.ios?.buildNumber;
  const android = Constants.expoConfig?.android?.versionCode;
  const native = Constants.nativeBuildVersion;
  if (Platform.OS === 'ios' && ios) return String(ios);
  if (Platform.OS === 'android' && android != null) return String(android);
  if (native) return String(native);
  return '1';
}

export function buildCommonAnalyticsContext(role: string | null): AnalyticsCommonContext {
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  return {
    platform: Platform.OS,
    environment: isDev ? 'development' : 'production',
    app_version: readAppVersion(),
    build_number: readBuildNumber(),
    role,
  };
}

/** Запрещённые ключи (PII / секреты). Только плоский слой — nested не принимаем. */
const BLOCKED_KEYS = new Set([
  'phone',
  'email',
  'full_name',
  'fullName',
  'name',
  'address',
  'comment',
  'comments',
  'token',
  'access_token',
  'jwt',
  'password',
  'promo_code',
  'promoCode',
  'code',
  'phone_hash',
  'phoneHash',
  'authorization',
  'bearer',
]);

const SYSTEM_KEYS = ['platform', 'environment', 'app_version', 'build_number', 'role'] as const;

/**
 * Fail-safe sanitization: только плоские string|number|boolean.
 * Не мутирует вход. Nested/array/circular отбрасываются без обхода.
 */
export function sanitizeAnalyticsProperties(
  properties?: AnalyticsProperties
): Record<string, string | number | boolean> {
  if (!properties || typeof properties !== 'object') return {};
  const out: Record<string, string | number | boolean> = {};
  try {
    for (const key of Object.keys(properties)) {
      if (BLOCKED_KEYS.has(key)) continue;
      let value: unknown;
      try {
        value = (properties as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        if (typeof value === 'number' && !Number.isFinite(value)) continue;
        out[key] = value;
      }
      // nested objects / arrays / functions — drop
    }
  } catch {
    return {};
  }
  return out;
}

/**
 * Системные поля имеют приоритет над входными params (не перезаписываются).
 */
export function mergeEventProperties(
  common: AnalyticsCommonContext,
  properties?: AnalyticsProperties
): Record<string, string | number | boolean> {
  const user = sanitizeAnalyticsProperties(properties);
  for (const k of SYSTEM_KEYS) {
    delete user[k];
  }
  const system = sanitizeAnalyticsProperties({
    platform: common.platform,
    environment: common.environment,
    app_version: common.app_version,
    build_number: common.build_number,
    role: common.role,
  });
  return { ...user, ...system };
}

export function toAnalyticsPrimitiveRecord(
  value: Record<string, AnalyticsPrimitive>
): Record<string, string | number | boolean> {
  return sanitizeAnalyticsProperties(value);
}

/** Денежная сумма для Revenue: >=0, finite, 2 знака. Иначе null. */
export function normalizeMoneyAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}
