import type { MasterSettings } from '@src/services/api/master';
import {
  getPromotionUrls,
  hasPromotionSlug,
  isPromotionReady,
  shouldShowPromotionCard,
} from '@src/utils/masterHomePromotion';

function settings(partial: Partial<MasterSettings['master']>): MasterSettings {
  return {
    user: {
      id: 1,
      full_name: 'Test',
      phone: '+79990000000',
      email: 'a@b.c',
      birth_date: null,
    },
    master: {
      id: 1,
      photo: '',
      bio: '',
      city: 'Москва',
      address: '',
      domain: '',
      experience_years: 0,
      auto_confirm_bookings: true,
      can_work_independently: false,
      can_work_in_salon: false,
      site_description: null,
      ...partial,
    },
  } as MasterSettings;
}

describe('masterHomePromotion', () => {
  it('shouldShowPromotionCard when can_work_independently', () => {
    expect(shouldShowPromotionCard(settings({ can_work_independently: true }))).toBe(true);
    expect(shouldShowPromotionCard(settings({ can_work_independently: false }))).toBe(false);
  });

  it('hasPromotionSlug when domain is set', () => {
    const withSlug = settings({ domain: 'my-master', can_work_independently: true });
    expect(hasPromotionSlug(withSlug)).toBe(true);
    expect(isPromotionReady(withSlug, 'https://dedato.ru')).toBe(true);
    const urls = getPromotionUrls(withSlug, 'https://dedato.ru');
    expect(urls.publicBookingUrl).toContain('/m/my-master');
    expect(urls.publicRoutePath).toBe('/m/my-master');
  });

  it('setup fallback when no slug', () => {
    const noSlug = settings({ domain: '', can_work_independently: true });
    expect(hasPromotionSlug(noSlug)).toBe(false);
    expect(isPromotionReady(noSlug, 'https://dedato.ru')).toBe(false);
  });
});
