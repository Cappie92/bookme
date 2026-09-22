export type AppInternalRoute = 'subscriptions';

const RETIRED_IOS_INTERNAL_SEGMENTS = [
  'subscriptions',
  'pricing',
  'tariff',
  'tariffs',
  'finance',
  'loyalty',
  'stats',
  'clients',
  'client-restrictions',
  'invitations',
  'website',
  'domain',
  'payment',
  'payments',
  'web-handoff',
  'handoff',
  'purchase',
] as const;

function pathLooksRetired(pathname: string): boolean {
  const normalized = pathname.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
  if (!normalized) return false;
  const parts = normalized.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  if ((RETIRED_IOS_INTERNAL_SEGMENTS as readonly string[]).includes(last)) return true;
  if (parts[0] === 'master' && parts[1] && (RETIRED_IOS_INTERNAL_SEGMENTS as readonly string[]).includes(parts[1])) {
    return true;
  }
  return false;
}

/** Retired commerce / browser-editor deep links so iOS can land on the dashboard. */
export function parseAppInternalRouteFromUrl(url: string | null | undefined): AppInternalRoute | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (/^dedato:/i.test(trimmed)) {
    const colon = trimmed.indexOf(':');
    const afterScheme = colon >= 0 ? trimmed.slice(colon + 1) : '';
    const path = afterScheme.replace(/^\/+/, '/');
    if (pathLooksRetired(path)) return 'subscriptions';
    try {
      const parsed = new URL(trimmed);
      const pathname = (parsed.pathname || '/').replace(/\/+$/, '') || '/';
      const host = (parsed.hostname || '').toLowerCase();
      if (pathLooksRetired(host) || pathLooksRetired(pathname)) return 'subscriptions';
    } catch {
      if (/^dedato:\/\/(?:subscriptions|pricing|tariff|finance|loyalty|stats|clients)(?:\/|\?|#|$)/i.test(trimmed)) {
        return 'subscriptions';
      }
    }
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('exp:') || lower.startsWith('exp+')) {
      if (pathLooksRetired(trimmed) || /\/(?:subscriptions|pricing|tariff|finance|loyalty|stats)(?:\/|\?|#|$)/.test(trimmed)) {
        return 'subscriptions';
      }
    }
  }
  return null;
}

/** iOS has no subscription or browser-editor screen: retired links resolve to dashboard. */
export const SUBSCRIPTIONS_APP_ROUTE = '/' as const;

export function appInternalRouteToPath(_route: AppInternalRoute): string {
  return '/';
}
