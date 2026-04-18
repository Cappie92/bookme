import { Platform } from 'react-native';
import {
  API_URL,
  API_URL_ANDROID,
  WEB_URL,
  EXTRA_UNIVERSAL_LINK_HOSTS,
  DEBUG_HTTP,
  DEBUG_AUTH,
  DEBUG_FEATURES,
  DEBUG_MENU,
  DEBUG_DASHBOARD,
  DEBUG_LOGS,
  DEBUG_MOBILE_ERRORS,
  DEBUG_AUTH_TRACE,
} from '@env';

function parseBool(val: string | undefined): boolean {
  const v = (val || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Плавающая DBG + буфер ошибок в UI: только явное `DEBUG_MOBILE_ERRORS=1` (не `true`/`yes` из .env). */
function isDbgFloatingPanelEnabled(): boolean {
  return __DEV__ && String(DEBUG_MOBILE_ERRORS ?? '').trim() === '1';
}

/**
 * В dev на Android опционально подменяем базовый API host (эмулятор: 10.0.2.2 → хост-машина).
 * В production всегда используется только API_URL (override игнорируется).
 */
function resolveEffectiveApiUrl(rawBase: string, rawAndroidOverride: string | undefined): string {
  const base = (rawBase || '').trim();
  if (!__DEV__) return base;
  const ao = (typeof rawAndroidOverride === 'string' ? rawAndroidOverride : '').trim();
  if (Platform.OS === 'android' && ao !== '') return ao;
  return base;
}

const rawApiUrl = (API_URL || '').trim();
const effectiveApiUrl = resolveEffectiveApiUrl(rawApiUrl, API_URL_ANDROID);

// Проверка и предупреждение при запуске
if (!rawApiUrl) {
  console.warn(
    '⚠️  API_URL не задана в .env файле. ' +
      'Пожалуйста, добавьте API_URL в mobile/.env для работы с backend API.'
  );
} else if (__DEV__ && (parseBool(DEBUG_HTTP) || parseBool(DEBUG_AUTH) || parseBool(DEBUG_LOGS))) {
  console.log('✅ API_URL (из .env):', rawApiUrl);
  if (effectiveApiUrl !== rawApiUrl) {
    console.log('   → effective для этой платформы (dev):', effectiveApiUrl);
  }
}

/** URL веб-приложения для публичной страницы записи /m/:slug. По умолчанию — тот же origin, что и API. */
function getWebUrl(effectiveApi: string): string {
  const w = typeof WEB_URL === 'string' ? WEB_URL : '';
  if (w.trim() !== '') return w.trim();
  const api = effectiveApi || '';
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

export const env = {
  API_URL: effectiveApiUrl,
  WEB_URL: getWebUrl(effectiveApiUrl),
  EXTRA_UNIVERSAL_LINK_HOSTS:
    typeof EXTRA_UNIVERSAL_LINK_HOSTS === 'string' ? EXTRA_UNIVERSAL_LINK_HOSTS.trim() : '',
  DEBUG_HTTP: parseBool(DEBUG_HTTP),
  DEBUG_AUTH: parseBool(DEBUG_AUTH),
  DEBUG_FEATURES: parseBool(DEBUG_FEATURES),
  DEBUG_MENU: parseBool(DEBUG_MENU),
  DEBUG_DASHBOARD: parseBool(DEBUG_DASHBOARD),
  DEBUG_LOGS: parseBool(DEBUG_LOGS),
  /** Парсинг как раньше (true/yes/1) — для прочих проверок, не для FAB. */
  DEBUG_MOBILE_ERRORS: parseBool(DEBUG_MOBILE_ERRORS),
  /** Узкая трассировка auth lifecycle для копирования из DBG (только __DEV__). */
  DEBUG_AUTH_TRACE: parseBool(DEBUG_AUTH_TRACE),
  /** FAB DBG и запись в mobile error buffer — строго `=1` в .env. */
  SHOW_DBG_FLOATING_PANEL: isDbgFloatingPanelEnabled(),
} as const;

/** Один раз за загрузку бандла: effective baseURL для axios (без секретов). */
if (__DEV__) {
  const u = env.API_URL.trim();
  if (u) {
    console.log('[ENV] Effective API_URL (axios baseURL):', u);
  }
}
