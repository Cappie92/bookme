import type { MasterSettings } from '@src/services/api/master';
import {
  buildMasterPublicBookingUrl,
  buildMasterPublicRoutePath,
} from '@src/utils/masterPublicBooking';
import { normalizeMasterDomainSlug } from '@src/utils/masterDomainSlug';

export function shouldShowPromotionCard(settings: MasterSettings | null): boolean {
  if (!settings?.master) return false;
  return settings.master.can_work_independently === true;
}

export function getPromotionSlug(settings: MasterSettings | null): string {
  return normalizeMasterDomainSlug(settings?.master?.domain || '');
}

export function hasPromotionSlug(settings: MasterSettings | null): boolean {
  return getPromotionSlug(settings).length > 0;
}

export function getPromotionUrls(
  settings: MasterSettings | null,
  webBaseUrl?: string | null
): {
  slug: string;
  publicBookingUrl: string | null;
  publicRoutePath: string | null;
} {
  const slug = getPromotionSlug(settings);
  const domain = settings?.master?.domain;
  return {
    slug,
    publicBookingUrl: buildMasterPublicBookingUrl(domain, webBaseUrl),
    publicRoutePath: buildMasterPublicRoutePath(domain),
  };
}

export function isPromotionReady(settings: MasterSettings | null, webBaseUrl?: string | null): boolean {
  const { publicBookingUrl } = getPromotionUrls(settings, webBaseUrl);
  return hasPromotionSlug(settings) && !!publicBookingUrl;
}
