import { PUBLIC_APP_LINK_ORIGIN } from '@env';
import { getTrustedUniversalLinkHosts } from '@src/utils/parsePublicMasterDeepLink';

/** Verified Android/iOS App Links host для share/copy (не env.WEB_URL). */
export const DEFAULT_PUBLIC_APP_LINK_ORIGIN = 'https://www.dedato.ru';

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * HTTPS origin для mobile-generated публичных ссылок /m/{slug}.
 * Приоритет: PUBLIC_APP_LINK_ORIGIN → www.* из trusted hosts → default www.dedato.ru.
 */
export function getPublicAppLinkOrigin(): string {
  const explicit =
    typeof PUBLIC_APP_LINK_ORIGIN === 'string' ? PUBLIC_APP_LINK_ORIGIN.trim() : '';
  if (explicit) {
    const normalized = normalizeOrigin(explicit);
    if (normalized) return normalized;
  }

  const hosts = getTrustedUniversalLinkHosts();
  const wwwHost = hosts.find(
    (h) =>
      h.startsWith('www.') &&
      h !== 'localhost' &&
      !h.includes('127.0.0.1') &&
      !h.startsWith('10.0.2.2')
  );
  if (wwwHost) {
    return `https://${wwwHost}`;
  }

  return DEFAULT_PUBLIC_APP_LINK_ORIGIN;
}
