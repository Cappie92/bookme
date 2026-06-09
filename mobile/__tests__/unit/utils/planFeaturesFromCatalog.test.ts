import {
  getPlanFeatureComparison,
  getWelcomeFeaturesIncluded,
  planTierRank,
  sortServiceFunctionsByTierAppearance,
} from '@src/utils/planFeaturesFromCatalog';

const SERVICE_FUNCTIONS = [
  { id: 2, name: 'extended_statistics', display_name: 'Статистика', display_order: 3 },
  { id: 3, name: 'loyalty_program', display_name: 'Лояльность', display_order: 4 },
  { id: 4, name: 'finance_management', display_name: 'Финансы', display_order: 5 },
  { id: 5, name: 'client_restrictions', display_name: 'Стоп-листы и предоплата', display_order: 6 },
  { id: 6, name: 'custom_domain', display_name: 'Персональный домен', display_order: 7 },
  { id: 7, name: 'clients', display_name: 'Клиенты', display_order: 8 },
];

const ALL_PLANS = [
  {
    name: 'Free',
    features: { service_functions: [1] },
    limits: { max_future_bookings: 30 },
  },
  {
    name: 'Basic',
    features: { service_functions: [1, 6, 7] },
    limits: { max_future_bookings: null },
  },
  {
    name: 'Pro',
    features: { service_functions: [1, 2, 5, 6, 7] },
    limits: {},
  },
  {
    name: 'Premium',
    features: { service_functions: [1, 2, 3, 4, 5, 6, 7] },
    limits: {},
  },
];

describe('planFeaturesFromCatalog', () => {
  it('derives Free limit from plan.limits.max_future_bookings', () => {
    const features = getWelcomeFeaturesIncluded(
      ALL_PLANS[0],
      SERVICE_FUNCTIONS,
      ALL_PLANS
    );
    expect(features).toEqual(['30 активных записей']);
  });

  it('maps paid plan flags to API display_name labels', () => {
    const features = getWelcomeFeaturesIncluded(
      ALL_PLANS[1],
      SERVICE_FUNCTIONS,
      ALL_PLANS
    );
    expect(features).toEqual([
      'Запись без ограничений',
      'Персональный домен',
      'Клиенты',
    ]);
  });

  it('returns included and excluded rows for comparison', () => {
    const rows = getPlanFeatureComparison(ALL_PLANS[1], SERVICE_FUNCTIONS, ALL_PLANS);
    expect(rows[0].text).toBe('Запись без ограничений');
    expect(rows.find((r) => r.text === 'Лояльность')?.available).toBe(false);
    expect(rows.find((r) => r.text === 'Статистика')?.available).toBe(false);
  });

  it('orders features by first appearance tier: Basic before Pro before Premium', () => {
    const ordered = sortServiceFunctionsByTierAppearance(ALL_PLANS, SERVICE_FUNCTIONS);
    const labels = ordered.map((f) => f.display_name);

    expect(labels.indexOf('Персональный домен')).toBeLessThan(labels.indexOf('Статистика'));
    expect(labels.indexOf('Клиенты')).toBeLessThan(labels.indexOf('Стоп-листы и предоплата'));
    expect(labels.indexOf('Стоп-листы и предоплата')).toBeLessThan(labels.indexOf('Лояльность'));
    expect(labels.indexOf('Лояльность')).toBeLessThan(labels.indexOf('Финансы'));
  });

  it('keeps bookings row first for every plan', () => {
    for (const plan of ALL_PLANS) {
      const rows = getPlanFeatureComparison(plan, SERVICE_FUNCTIONS, ALL_PLANS);
      expect(rows[0].available).toBe(true);
      if (plan.name === 'Free') {
        expect(rows[0].text).toContain('активных записей');
      } else {
        expect(rows[0].text).toBe('Запись без ограничений');
      }
    }
  });

  it('uses live display_name from catalog, not hardcoded dictionary', () => {
    const customCatalog = [
      { id: 3, name: 'loyalty_program', display_name: 'Программа лояльности из API', display_order: 4 },
    ];
    const features = getWelcomeFeaturesIncluded(
      ALL_PLANS[3],
      customCatalog,
      ALL_PLANS
    );
    expect(features).toContain('Программа лояльности из API');
    expect(features).not.toContain('Лояльность');
  });

  it('resolves plan tier ranks for API plan names', () => {
    expect(planTierRank('Free')).toBe(0);
    expect(planTierRank('Basic')).toBe(1);
    expect(planTierRank('Pro')).toBe(2);
    expect(planTierRank('Premium')).toBe(3);
    expect(planTierRank('Unknown')).toBe(99);
  });
});
