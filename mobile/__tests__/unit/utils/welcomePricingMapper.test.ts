import {
  mapPricingCatalogToWelcomePlans,
  resolveDefaultWelcomePlanId,
  ensureWelcomeSelectedPlanId,
} from '@src/utils/welcomePricingMapper';
import type { PricingCatalogResponse } from '@src/services/api/subscriptions';
import { WELCOME_PRICING_FALLBACK_PLANS } from '@src/data/welcomePricingData';

const SAMPLE_CATALOG: PricingCatalogResponse = {
  plans: [
    {
      id: 1,
      name: 'Free',
      display_name: 'Бесплатный',
      subscription_type: 'master',
      price_1month: 0,
      price_3months: 0,
      price_6months: 0,
      price_12months: 0,
      features: { service_functions: [1] },
      limits: { max_future_bookings: 30 },
      is_active: true,
      display_order: 1,
    },
    {
      id: 2,
      name: 'Basic',
      display_name: 'Базовый',
      subscription_type: 'master',
      price_1month: 500,
      price_3months: 460,
      price_6months: 440,
      price_12months: 380,
      features: { service_functions: [1, 6, 7] },
      limits: {},
      is_active: true,
      display_order: 2,
    },
    {
      id: 3,
      name: 'Pro',
      display_name: 'Стандартный',
      subscription_type: 'master',
      price_1month: 760,
      price_3months: 700,
      price_6months: 670,
      price_12months: 580,
      features: { service_functions: [1, 2, 5, 6, 7] },
      limits: {},
      is_active: true,
      display_order: 3,
    },
    {
      id: 4,
      name: 'Premium',
      display_name: 'Премиум',
      subscription_type: 'master',
      price_1month: 1160,
      price_3months: 1070,
      price_6months: 1020,
      price_12months: 900,
      features: { service_functions: [1, 2, 3, 4, 5, 6, 7] },
      limits: {},
      is_active: true,
      display_order: 4,
    },
  ],
  service_functions: [
    { id: 2, name: 'extended_statistics', display_name: 'Статистика', display_order: 3 },
    { id: 3, name: 'loyalty_program', display_name: 'Лояльность', display_order: 4 },
    { id: 4, name: 'finance_management', display_name: 'Финансы', display_order: 5 },
    { id: 5, name: 'client_restrictions', display_name: 'Стоп-листы и предоплата', display_order: 6 },
    { id: 6, name: 'custom_domain', display_name: 'Персональный домен', display_order: 7 },
    { id: 7, name: 'clients', display_name: 'Клиенты', display_order: 8 },
  ],
};

describe('welcomePricingMapper', () => {
  it('maps API catalog to welcome plans with correct prices and names', () => {
    const plans = mapPricingCatalogToWelcomePlans(SAMPLE_CATALOG);
    expect(plans).toHaveLength(4);
    expect(plans.map((p) => p.displayName)).toEqual([
      'Бесплатный',
      'Базовый',
      'Стандартный',
      'Премиум',
    ]);

    const standard = plans.find((p) => p.name === 'Pro')!;
    const premium = plans.find((p) => p.name === 'Premium')!;
    expect(standard.price1Month).toBe(760);
    expect(standard.price3Months).toBe(700);
    expect(premium.price1Month).toBe(1160);
    expect(premium.price12Months).toBe(900);
    expect(standard.popular).toBe(true);
  });

  it('builds features from API service_functions and limits (not local fallback list)', () => {
    const plans = mapPricingCatalogToWelcomePlans(SAMPLE_CATALOG);
    const free = plans.find((p) => p.id === 'free')!;
    const basic = plans.find((p) => p.id === 'basic')!;
    const premium = plans.find((p) => p.id === 'premium')!;

    expect(free.featuresIncluded).toEqual(['30 активных записей']);
    expect(basic.featuresIncluded).toContain('Без ограничений на запись');
    expect(basic.featuresIncluded).toContain('Персональный домен');
    expect(basic.featuresIncluded).toContain('Клиенты');
    expect(premium.featuresIncluded).toContain('Лояльность');
    expect(premium.featuresIncluded).toContain('Финансы');
  });

  it('uses display_name from API catalog for service function labels', () => {
    const catalog: PricingCatalogResponse = {
      ...SAMPLE_CATALOG,
      service_functions: SAMPLE_CATALOG.service_functions.map((sf) =>
        sf.id === 3 ? { ...sf, display_name: 'Программа лояльности из API' } : sf
      ),
    };
    const premium = mapPricingCatalogToWelcomePlans(catalog).find((p) => p.id === 'premium')!;
    expect(premium.featuresIncluded).toContain('Программа лояльности из API');
    expect(premium.featuresIncluded).not.toContain('Лояльность');
  });

  it('resolves default and ensures selected plan id', () => {
    const plans = mapPricingCatalogToWelcomePlans(SAMPLE_CATALOG);
    expect(resolveDefaultWelcomePlanId(plans)).toBe('pro');
    expect(ensureWelcomeSelectedPlanId(plans, 'missing')).toBe('pro');
    expect(ensureWelcomeSelectedPlanId(plans, 'premium')).toBe('premium');
  });

  it('fallback plans remain available offline', () => {
    expect(WELCOME_PRICING_FALLBACK_PLANS).toHaveLength(4);
  });
});
