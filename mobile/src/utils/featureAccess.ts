import { SubscriptionPlan } from '@src/services/api/subscriptions';

/**
 * Маппинг feature key → service_function ID (только для поиска плана с функцией)
 * Используется ТОЛЬКО для getCheapestPlanForFeature, НЕ для проверки доступа
 */
const FEATURE_TO_SERVICE_FUNCTION_ID: Record<string, number> = {
  has_booking_page: 1,
  has_extended_stats: 2,
  has_loyalty_access: 3,
  has_finance_access: 4,
  has_client_restrictions: 5,
  can_customize_domain: 6,
  has_clients_access: 7,
};

/**
 * Получает название самого дешевого тарифа, где доступна указанная функция
 * @param plans - Массив планов подписки
 * @param featureKey - Ключ функции (например, 'has_finance_access')
 * @returns Название самого дешевого тарифа или null
 */
export function getCheapestPlanForFeature(
  plans: SubscriptionPlan[],
  featureKey: string
): string | null {
  if (!plans || !Array.isArray(plans) || plans.length === 0) {
    return null;
  }

  // Получаем service_function ID для этой функции
  const serviceFunctionId = FEATURE_TO_SERVICE_FUNCTION_ID[featureKey];
  if (!serviceFunctionId) {
    return null;
  }

  // Фильтруем планы, где есть нужная функция
  const plansWithFeature = plans.filter((plan) => {
    const features = plan.features || {};
    const serviceFunctions = features.service_functions || [];
    return serviceFunctions.includes(serviceFunctionId);
  });

  if (plansWithFeature.length === 0) {
    return null;
  }

  // Находим самый дешевый план по price_1month
  const cheapestPlan = plansWithFeature.reduce((cheapest, current) => {
    const currentPrice = current.price_1month || Infinity;
    const cheapestPrice = cheapest.price_1month || Infinity;
    return currentPrice < cheapestPrice ? current : cheapest;
  });

  // Возвращаем display_name или name
  return cheapestPlan.display_name || cheapestPlan.name || null;
}

