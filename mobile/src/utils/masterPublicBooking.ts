import { env } from '@src/config/env';
import { masterDomainSlugFromStored } from '@src/utils/masterDomainSlug';

export function normalizeWebBaseUrl(base: string | null | undefined): string {
  const b = String(base || '').trim();
  if (!b) return '';
  return b.endsWith('/') ? b.slice(0, -1) : b;
}

/** Канонический URL публичной страницы: https://dedato.ru/m/{slug} */
export function buildMasterPublicBookingUrl(
  domain: string | null | undefined,
  baseUrl?: string | null
): string | null {
  const webBase = normalizeWebBaseUrl(baseUrl || env.WEB_URL || 'https://dedato.ru');
  const slug = masterDomainSlugFromStored(domain);
  if (!webBase || !slug) return null;
  return `${webBase}/m/${slug}`;
}

/** Внутренний route expo-router для публичной записи. */
export function buildMasterPublicRoutePath(domain: string | null | undefined): string | null {
  const slug = masterDomainSlugFromStored(domain);
  if (!slug) return null;
  return `/m/${encodeURIComponent(slug)}`;
}
