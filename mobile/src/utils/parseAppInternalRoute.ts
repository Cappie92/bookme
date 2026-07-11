export type AppInternalRoute = 'subscriptions';

/**
 * Внутренние deep links приложения (не публичные /m/{slug}).
 * Сейчас: dedato://subscriptions → экран тарифов мастера.
 */
export function parseAppInternalRouteFromUrl(url: string | null | undefined): AppInternalRoute | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (/^dedato:/i.test(trimmed)) {
    const colon = trimmed.indexOf(':');
    const afterScheme = colon >= 0 ? trimmed.slice(colon + 1) : '';
    const path = afterScheme.replace(/^\/+/, '/');
    if (path === '/subscriptions' || path.startsWith('/subscriptions?') || path.startsWith('/subscriptions#')) {
      return 'subscriptions';
    }

    try {
      const u = new URL(trimmed);
      const host = (u.hostname || '').toLowerCase();
      const pathname = (u.pathname || '/').replace(/\/+$/, '') || '/';
      if (host === 'subscriptions' || pathname === '/subscriptions') {
        return 'subscriptions';
      }
    } catch {
      if (/^dedato:\/\/subscriptions(?:\/|\?|#|$)/i.test(trimmed)) {
        return 'subscriptions';
      }
    }
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const low = trimmed.toLowerCase();
    if (low.startsWith('exp:') || low.startsWith('exp+')) {
      if (/--\/subscriptions(?:\/|\?|#|$)/.test(trimmed) || /\/subscriptions(?:\/|\?|#|$)/.test(trimmed)) {
        return 'subscriptions';
      }
    }
  }

  return null;
}

export const SUBSCRIPTIONS_APP_ROUTE = '/subscriptions' as const;

export function appInternalRouteToPath(route: AppInternalRoute): string {
  if (route === 'subscriptions') {
    return SUBSCRIPTIONS_APP_ROUTE;
  }
  return '/';
}
