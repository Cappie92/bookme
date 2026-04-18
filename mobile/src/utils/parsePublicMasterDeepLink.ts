import { env } from '@src/config/env';

/**
 * Хосты, с которых разрешён HTTPS/HTTP deep link на /m/{slug}.
 * = hostname из WEB_URL + EXTRA_UNIVERSAL_LINK_HOSTS (через запятую).
 * В production для http ссылок парсинг отключён (только https), кроме __DEV__.
 */
export function getTrustedUniversalLinkHosts(): string[] {
  const hosts = new Set<string>();
  try {
    const w = (env.WEB_URL || '').trim();
    if (w) {
      const h = new URL(w).hostname.toLowerCase();
      if (h) hosts.add(h);
    }
  } catch {
    /* ignore */
  }
  const extra = typeof env.EXTRA_UNIVERSAL_LINK_HOSTS === 'string' ? env.EXTRA_UNIVERSAL_LINK_HOSTS : '';
  for (const part of extra.split(',')) {
    const h = part.trim().toLowerCase();
    if (h) hosts.add(h);
  }
  if (hosts.size === 0) {
    hosts.add('dedato.ru');
    hosts.add('www.dedato.ru');
  }
  if (hosts.has('dedato.ru')) hosts.add('www.dedato.ru');
  if (hosts.has('www.dedato.ru')) hosts.add('dedato.ru');
  return [...hosts];
}

/**
 * Извлекает slug публичной страницы записи из custom scheme или доверенного https/http URL.
 * Поддерживается: dedato://m/{slug}, https://host/m/{slug} (host из whitelist).
 */
export function parsePublicMasterSlugFromUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (/^dedato:\/\//i.test(trimmed)) {
    const m = trimmed.match(/^dedato:\/\/m\/([^?#]+)/i);
    if (!m?.[1]) return null;
    const slug = decodeURIComponent(m[1].replace(/\/+$/, ''));
    return slug || null;
  }

  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.protocol === 'http:' && !__DEV__) return null;

    const host = u.hostname.toLowerCase();
    const trusted = new Set(getTrustedUniversalLinkHosts());
    if (!trusted.has(host)) return null;

    const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
    const pathMatch = path.match(/^\/m\/([^/]+)$/);
    if (!pathMatch?.[1]) return null;
    const slug = decodeURIComponent(pathMatch[1]);
    return slug || null;
  } catch {
    return null;
  }
}
