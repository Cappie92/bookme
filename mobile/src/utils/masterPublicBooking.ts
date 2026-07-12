import { getPublicAppLinkOrigin } from '@src/config/publicAppLinkOrigin';
import { masterDomainSlugFromStored } from '@src/utils/masterDomainSlug';

export function normalizeWebBaseUrl(base: string | null | undefined): string {
  const b = String(base || '').trim();
  if (!b) return '';
  return b.endsWith('/') ? b.slice(0, -1) : b;
}

/**
 * Публичная HTTPS-ссылка для share/copy/App Links: {canonicalOrigin}/m/{slug}.
 * Origin — getPublicAppLinkOrigin() (по умолчанию https://www.dedato.ru), не env.WEB_URL.
 * @param baseUrl — только для unit-тests override
 */
export function buildMasterPublicBookingUrl(
  domain: string | null | undefined,
  baseUrl?: string | null
): string | null {
  const webBase = normalizeWebBaseUrl(baseUrl ?? getPublicAppLinkOrigin());
  const slug = masterDomainSlugFromStored(domain);
  if (!webBase || !slug) return null;
  return `${webBase}/m/${slug}`;
}

/** Внутренний route expo-router для публичной записи (dedato:// и in-app navigation). */
export function buildMasterPublicRoutePath(domain: string | null | undefined): string | null {
  const slug = masterDomainSlugFromStored(domain);
  if (!slug) return null;
  return `/m/${encodeURIComponent(slug)}`;
}
