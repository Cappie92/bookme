import { getWelcomeFeaturesIncluded } from '@src/utils/planFeaturesFromCatalog';

const SERVICE_FUNCTIONS = [
  { id: 2, name: 'extended_statistics', display_name: 'Статистика', display_order: 3 },
  { id: 3, name: 'loyalty_program', display_name: 'Лояльность', display_order: 4 },
  { id: 6, name: 'custom_domain', display_name: 'Персональный домен', display_order: 7 },
  { id: 7, name: 'clients', display_name: 'Клиенты', display_order: 8 },
];

describe('planFeaturesFromCatalog', () => {
  it('derives Free limit from plan.limits.max_future_bookings', () => {
    const features = getWelcomeFeaturesIncluded(
      {
        name: 'Free',
        features: { service_functions: [1] },
        limits: { max_future_bookings: 30 },
      },
      SERVICE_FUNCTIONS
    );
    expect(features).toEqual(['30 активных записей']);
  });

  it('maps paid plan flags to API display_name labels', () => {
    const features = getWelcomeFeaturesIncluded(
      {
        name: 'Basic',
        features: { service_functions: [1, 6, 7] },
        limits: { max_future_bookings: null },
      },
      SERVICE_FUNCTIONS
    );
    expect(features).toEqual([
      'Без ограничений на запись',
      'Персональный домен',
      'Клиенты',
    ]);
  });

  it('uses live display_name from catalog, not hardcoded dictionary', () => {
    const features = getWelcomeFeaturesIncluded(
      {
        name: 'Premium',
        features: { service_functions: [1, 3] },
        limits: {},
      },
      [{ id: 3, name: 'loyalty_program', display_name: 'Программа лояльности из API', display_order: 4 }]
    );
    expect(features).toContain('Программа лояльности из API');
    expect(features).not.toContain('Лояльность');
  });
});
