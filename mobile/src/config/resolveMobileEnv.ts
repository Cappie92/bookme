/**
 * Источники API_URL / WEB_URL для mobile (EAS + local .env).
 * Чистые функции — тестируются без expo-constants / @env.
 */

export type MobilePlatform = 'ios' | 'android' | 'web';

export type ResolveMobileEnvInput = {
  isDev: boolean;
  platform: MobilePlatform;
  dotenvApiUrl?: string;
  dotenvApiUrlAndroid?: string;
  dotenvWebUrl?: string;
  extraApiUrl?: string;
  extraWebUrl?: string;
  processEnv?: {
    API_URL?: string;
    EXPO_PUBLIC_API_URL?: string;
    WEB_URL?: string;
    EXPO_PUBLIC_WEB_URL?: string;
  };
};

export class InvalidProductionApiUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProductionApiUrlError';
  }
}

function pickFirst(...values: (string | undefined)[]): string {
  for (const v of values) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return '';
}

/** Приоритет A → B: extra / process.env / EXPO_PUBLIC_* → dotenv. */
export function resolveRawApiUrl(input: ResolveMobileEnvInput): string {
  const pe = input.processEnv ?? {};
  return pickFirst(
    input.extraApiUrl,
    pe.API_URL,
    pe.EXPO_PUBLIC_API_URL,
    input.dotenvApiUrl
  );
}

/** Приоритет A → B для WEB_URL; иначе эвристика от effective API (как раньше). */
export function resolveRawWebUrl(input: ResolveMobileEnvInput, effectiveApiUrl: string): string {
  const pe = input.processEnv ?? {};
  const explicit = pickFirst(
    input.extraWebUrl,
    pe.WEB_URL,
    pe.EXPO_PUBLIC_WEB_URL,
    input.dotenvWebUrl
  );
  if (explicit) return explicit;

  const api = effectiveApiUrl || '';
  if (api.includes('localhost') || api.includes('127.0.0.1') || api.includes('10.0.2.2')) {
    return 'http://localhost:5173';
  }
  if (api.includes('dedato.ru')) return 'https://dedato.ru';
  try {
    const u = new URL(api);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'https://dedato.ru';
  }
}

/**
 * Android dev override: только __DEV__ + android + непустой API_URL_ANDROID.
 */
export function resolveEffectiveApiUrl(
  rawBase: string,
  rawAndroidOverride: string | undefined,
  isDev: boolean,
  platform: MobilePlatform
): string {
  const base = (rawBase || '').trim();
  if (!isDev) return base;
  const ao = (rawAndroidOverride ?? '').trim();
  if (platform === 'android' && ao !== '') return ao;
  return base;
}

export function assertProductionApiUrl(apiUrl: string, isDev: boolean): void {
  if (isDev) return;
  const u = apiUrl.trim();
  if (!u) {
    throw new InvalidProductionApiUrlError(
      '[ENV] Production API_URL is empty. Set API_URL in eas.json (preview/production) or EAS secrets; local dev uses mobile/.env.'
    );
  }
  const lower = u.toLowerCase();
  if (lower.includes('localhost')) {
    throw new InvalidProductionApiUrlError(
      `[ENV] Production API_URL must not use localhost (got: ${u}). Use eas.json env for EAS builds.`
    );
  }
  if (lower.includes('127.0.0.1')) {
    throw new InvalidProductionApiUrlError(
      `[ENV] Production API_URL must not use 127.0.0.1 (got: ${u}). Use eas.json env for EAS builds.`
    );
  }
}

export function buildMobileEnvUrls(input: ResolveMobileEnvInput): {
  rawApiUrl: string;
  API_URL: string;
  WEB_URL: string;
} {
  const rawApiUrl = resolveRawApiUrl(input);
  const API_URL = resolveEffectiveApiUrl(
    rawApiUrl,
    input.dotenvApiUrlAndroid,
    input.isDev,
    input.platform
  );
  assertProductionApiUrl(API_URL, input.isDev);
  const WEB_URL = resolveRawWebUrl(input, API_URL);
  return { rawApiUrl, API_URL, WEB_URL };
}
