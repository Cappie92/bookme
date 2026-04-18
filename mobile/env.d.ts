declare module '@env' {
  export const API_URL: string;
  /** Только dev: Android может подменить API_URL (эмулятор: host 10.0.2.2). В prod не используется. */
  export const API_URL_ANDROID: string | undefined;
  export const WEB_URL: string | undefined;
  /** Доп. хосты для HTTPS deep links (через запятую), если не совпадают с WEB_URL. См. docs/mobile/UNIVERSAL_APP_LINKS.md */
  export const EXTRA_UNIVERSAL_LINK_HOSTS: string | undefined;
  export const DEBUG_HTTP: string | undefined;
  export const DEBUG_AUTH: string | undefined;
  export const DEBUG_FEATURES: string | undefined;
  export const DEBUG_MENU: string | undefined;
  export const DEBUG_DASHBOARD: string | undefined;
  export const DEBUG_LOGS: string | undefined;
  /** Dev: панель DBG с копируемым логом API / logger.error / runtime (не для production). */
  export const DEBUG_MOBILE_ERRORS: string | undefined;
  /** Dev: ring-buffer auth lifecycle trace (storage, bootstrap, /me, destructive ops, AuthGate) — копируется из DBG. */
  export const DEBUG_AUTH_TRACE: string | undefined;
}

