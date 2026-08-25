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

/** Запрещённые ключи (PII / секреты). Сравнение нечувствительно к регистру/разделителям. */
const BLOCKED_KEYS = new Set([
  'phone',
  'email',
  'fullname',
  'name',
  'address',
  'comment',
  'comments',
  'token',
  'accesstoken',
  'refreshtoken',
  'devicetoken',
  'pushtoken',
  'jwt',
  'jws',
  'password',
  'promocode',
  'code',
  'phonehash',
  'authorization',
  'bearer',
  'transactionid',
  'originaltransactionid',
  'appaccounttoken',
  'signedtransaction',
  'signedrenewalinfo',
  'receipt',
]);

const SYSTEM_KEYS = ['platform', 'environment', 'app_version', 'build_number', 'role'] as const;

function normalizeSensitiveKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function containsSensitiveString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(trimmed)) return true;
  if (/(?:^|\D)\+?\d[\d\s().-]{8,}\d(?:\D|$)/.test(trimmed)) return true;
  if (/\bBearer\s+\S+/i.test(trimmed)) return true;
  if (/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(trimmed)) return true;
  if (/-----BEGIN [A-Z ]+-----/.test(trimmed)) return true;
  return false;
}

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
      if (BLOCKED_KEYS.has(normalizeSensitiveKey(key))) continue;
      let value: unknown;
      try {
        value = (properties as Record<string, unknown>)[key];
      } catch {
        continue;
      }
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        if (typeof value === 'number' && !Number.isFinite(value)) continue;
        if (typeof value === 'string' && (value.length > 512 || containsSensitiveString(value))) continue;
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

/** AppMetrica profile id may only be a positive backend numeric User.id. */
export function normalizeAnalyticsUserId(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^[1-9]\d{0,19}$/.test(trimmed)) return null;
  return trimmed;
}

export function sanitizeAnalyticsProductId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(trimmed)) return undefined;
  return trimmed;
}

/** Redacts common credentials/PII before an error is sent to a third-party SDK. */
export function sanitizeAnalyticsErrorText(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const redacted = raw
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/(^|\D)\+?\d[\d\s().-]{8,}\d(?=\D|$)/g, '$1[REDACTED_PHONE]')
    .replace(
      /\b(token|access[_-]?token|refresh[_-]?token|device[_-]?token|password|authorization|app[_-]?account[_-]?token|signed[_-]?transaction|signed[_-]?renewal[_-]?info|original[_-]?transaction[_-]?id|transaction[_-]?id)\s*[:=]\s*["']?[^\s,;}"']+/gi,
      '$1=[REDACTED_CREDENTIAL]'
    )
    .replace(/\bBearer\s+\S+/gi, '[REDACTED_CREDENTIAL]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_CREDENTIAL]')
    .replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '[REDACTED_CREDENTIAL]')
    .trim();
  return (redacted || 'analytics_error').slice(0, 240);
}

export function sanitizeAnalyticsErrorIdentifier(value: unknown): string {
  if (typeof value !== 'string') return 'analytics_error';
  const trimmed = value.trim();
  return /^[A-Za-z0-9_.:-]{1,80}$/.test(trimmed) ? trimmed : 'analytics_error';
}
