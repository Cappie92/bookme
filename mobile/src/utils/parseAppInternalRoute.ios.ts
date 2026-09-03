export type AppInternalRoute = 'subscriptions';

/** Recognize retired commerce deep links so iOS can redirect them safely. */
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
      const parsed = new URL(trimmed);
      const pathname = (parsed.pathname || '/').replace(/\/+$/, '') || '/';
      if ((parsed.hostname || '').toLowerCase() === 'subscriptions' || pathname === '/subscriptions') {
        return 'subscriptions';
      }
    } catch {
      if (/^dedato:\/\/subscriptions(?:\/|\?|#|$)/i.test(trimmed)) return 'subscriptions';
    }
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const lower = trimmed.toLowerCase();
    if ((lower.startsWith('exp:') || lower.startsWith('exp+')) && /\/subscriptions(?:\/|\?|#|$)/.test(trimmed)) {
      return 'subscriptions';
    }
  }
  return null;
}

/** iOS has no subscription screen: retired links resolve to the master dashboard. */
export const SUBSCRIPTIONS_APP_ROUTE = '/' as const;

export function appInternalRouteToPath(_route: AppInternalRoute): string {
  return '/';
}
