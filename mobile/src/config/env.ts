import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  API_URL as DOTENV_API_URL,
  API_URL_ANDROID,
  WEB_URL as DOTENV_WEB_URL,
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
import { buildMobileEnvUrls } from './resolveMobileEnv';

function parseBool(val: string | undefined): boolean {
  const v = (val || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Плавающая DBG + буфер ошибок в UI: только явное `DEBUG_MOBILE_ERRORS=1` (не `true`/`yes` из .env). */
function isDbgFloatingPanelEnabled(): boolean {
  return __DEV__ && String(DEBUG_MOBILE_ERRORS ?? '').trim() === '1';
}

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
const extraApiUrl = typeof extra.API_URL === 'string' ? extra.API_URL : undefined;
const extraWebUrl = typeof extra.WEB_URL === 'string' ? extra.WEB_URL : undefined;

const pe =
  typeof process !== 'undefined' && process.env
    ? {
        API_URL: process.env.API_URL,
        EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
        WEB_URL: process.env.WEB_URL,
        EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL,
      }
    : undefined;

const platform =
  Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
    ? Platform.OS
    : 'web';

const { rawApiUrl, API_URL: effectiveApiUrl, WEB_URL } = buildMobileEnvUrls({
  isDev: __DEV__,
  platform,
  dotenvApiUrl: DOTENV_API_URL,
  dotenvApiUrlAndroid: API_URL_ANDROID,
  dotenvWebUrl: DOTENV_WEB_URL,
  extraApiUrl,
  extraWebUrl,
  processEnv: pe,
});

if (!rawApiUrl && __DEV__) {
  console.warn(
    '⚠️  API_URL не задана (extra / process.env / mobile/.env). ' +
      'Добавьте API_URL в mobile/.env для локальной разработки.'
  );
} else if (__DEV__ && (parseBool(DEBUG_HTTP) || parseBool(DEBUG_AUTH) || parseBool(DEBUG_LOGS))) {
  console.log('✅ API_URL (resolved):', effectiveApiUrl);
  if (effectiveApiUrl !== (DOTENV_API_URL || '').trim()) {
    console.log('   → dotenv base was:', (DOTENV_API_URL || '').trim() || '(empty)');
  }
}

export const env = {
  API_URL: effectiveApiUrl,
  WEB_URL,
  EXTRA_UNIVERSAL_LINK_HOSTS:
    typeof EXTRA_UNIVERSAL_LINK_HOSTS === 'string' ? EXTRA_UNIVERSAL_LINK_HOSTS.trim() : '',
  DEBUG_HTTP: parseBool(DEBUG_HTTP),
  DEBUG_AUTH: parseBool(DEBUG_AUTH),
  DEBUG_FEATURES: parseBool(DEBUG_FEATURES),
  DEBUG_MENU: parseBool(DEBUG_MENU),
  DEBUG_DASHBOARD: parseBool(DEBUG_DASHBOARD),
  DEBUG_LOGS: parseBool(DEBUG_LOGS),
  DEBUG_MOBILE_ERRORS: parseBool(DEBUG_MOBILE_ERRORS),
  DEBUG_AUTH_TRACE: parseBool(DEBUG_AUTH_TRACE),
  SHOW_DBG_FLOATING_PANEL: isDbgFloatingPanelEnabled(),
} as const;

if (__DEV__) {
  const u = env.API_URL.trim();
  if (u) {
    console.log('[ENV] Effective API_URL (axios baseURL):', u);
  }
}
