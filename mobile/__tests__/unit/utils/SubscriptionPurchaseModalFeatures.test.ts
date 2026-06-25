import { getSubscriptionPlanFeatureLabels } from '@src/utils/subscriptionPlanFeatures';

const SERVICE_FUNCTIONS = [
  { id: 2, name: 'extended_statistics', display_name: 'Статистика', display_order: 3 },
  { id: 3, name: 'loyalty_program', display_name: 'Лояльность', display_order: 4 },
  { id: 4, name: 'finance_management', display_name: 'Финансы', display_order: 5 },
  { id: 5, name: 'client_restrictions', display_name: 'Стоп-листы и предоплата', display_order: 6 },
  { id: 6, name: 'custom_domain', display_name: 'Персональный домен', display_order: 7 },
  { id: 7, name: 'clients', display_name: 'Клиенты', display_order: 8 },
];

function included(plan: { name: string; features: Record<string, unknown>; limits?: Record<string, unknown> }) {
  return getSubscriptionPlanFeatureLabels(plan, SERVICE_FUNCTIONS);
}

describe('SubscriptionPurchaseModal tariff features', () => {
  it('shows complete feature set for Basic', () => {
    expect(included({ name: 'Basic', features: { service_functions: [1, 6] } })).toEqual([
      'Без ограничений на запись',
      'Персональный домен',
    ]);
  });

  it('shows complete feature set for Standard', () => {
    expect(included({ name: 'Pro', features: { service_functions: [1, 2, 5, 6, 7] } })).toEqual([
      'Без ограничений на запись',
      'Статистика',
      'Стоп-листы и предоплата',
      'Персональный домен',
      'Клиенты',
    ]);
  });

  it('shows complete feature set for Premium without slicing', () => {
    expect(included({ name: 'Premium', features: { service_functions: [1, 2, 3, 4, 5, 6, 7] } })).toEqual([
      'Без ограничений на запись',
      'Статистика',
      'Лояльность',
      'Финансы',
      'Стоп-листы и предоплата',
      'Персональный домен',
      'Клиенты',
    ]);
  });
});
