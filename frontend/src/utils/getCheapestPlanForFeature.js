/**
 * Получает название самого дешевого тарифа, где доступна указанная функция
 * @param {Array} plans - Массив планов подписки
 * @param {number} serviceFunctionId - ID service_function (3 для лояльности, 4 для финансов)
 * @returns {string|null} Название самого дешевого тарифа или null
 */
export function getCheapestPlanForFeature(plans, serviceFunctionId) {
  if (!plans || !Array.isArray(plans) || plans.length === 0) {
    return null
  }

  // Фильтруем планы, где есть нужная функция
  const plansWithFeature = plans.filter(plan => {
    const features = plan.features || {}
    const serviceFunctions = features.service_functions || []
    return serviceFunctions.includes(serviceFunctionId)
  })

  if (plansWithFeature.length === 0) {
    return null
  }

  // Находим самый дешевый план по price_1month
  const cheapestPlan = plansWithFeature.reduce((cheapest, current) => {
    const currentPrice = current.price_1month || Infinity
    const cheapestPrice = cheapest.price_1month || Infinity
    return currentPrice < cheapestPrice ? current : cheapest
  })

  // Возвращаем display_name или name
  return cheapestPlan.display_name || cheapestPlan.name || null
}

