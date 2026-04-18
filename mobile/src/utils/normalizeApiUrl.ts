/**
 * Axios склеивает baseURL + url: при base `https://host/api` и path `/api/master/foo`
 * получается `https://host/api/api/master/foo` → 405 / неверный роут.
 * Если base заканчивается на `/api`, убираем дублирующий префикс `/api` у относительного пути.
 */
export function normalizeRelativeUrlForApiBase(
  baseURL: string | undefined,
  relativeUrl: string | undefined
): string | undefined {
  if (!relativeUrl || !baseURL) return relativeUrl;
  const base = baseURL.replace(/\/+$/, '');
  if (!/\/api$/i.test(base)) return relativeUrl;
  const u = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
  if (u.startsWith('/api/')) {
    return `/${u.slice(5)}`;
  }
  if (u === '/api') {
    return '/';
  }
  return relativeUrl;
}

/** Путь к эндпоинтам мастера (после нормализации или в исходном виде). */
export function isMasterExclusiveApiPath(url: string): boolean {
  if (url.includes('/client/')) return false;
  return url.includes('/api/master/') || url.startsWith('/master/');
}
