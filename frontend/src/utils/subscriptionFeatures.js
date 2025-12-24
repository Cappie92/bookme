/**
 * Единый источник правды для функций тарифных планов
 * Используется во всех компонентах для отображения функций тарифов
 */

/**
 * Конфигурация функций тарифов
 * Определяет порядок отображения и человекочитаемые названия
 * ВАЖНО: Здесь только специфичные функции, которые не могут быть в service_functions
 * (например, лимиты на записи). Все остальные функции берутся из service_functions.
 */
export const SUBSCRIPTION_FEATURES_CONFIG = [
  {
    key: 'bookings',
    label: 'Без ограничений на запись',
    labelFree: (maxBookings) => `${maxBookings} активных записей`,
    labelFreeUnavailable: 'безлимитные записи',
    checkFunction: (plan) => {
      // Для Free плана - проверяем лимит
      if (plan.name === 'Free') {
        const maxBookings = plan.limits?.max_future_bookings || 30
        return { available: true, text: `${maxBookings} активных записей` }
      }
      // Для платных планов - всегда доступно
      return { available: true, text: 'Без ограничений на запись' }
    }
  }
]

/**
 * Получить список функций тарифа с единым порядком
 * Сначала доступные функции, потом недоступные
 * 
 * @param {Object} plan - Объект плана подписки с полями features и limits
 * @param {Array} serviceFunctions - Массив service_functions с типом SUBSCRIPTION
 * @param {boolean} isAlwaysFree - Флаг, указывающий что пользователь имеет is_always_free
 * @returns {Array} Массив объектов { text: string, available: boolean }
 */
export function getPlanFeatures(plan, serviceFunctions = [], isAlwaysFree = false) {
  if (!plan) return []
  
  const features = plan.features || {}
  const limits = plan.limits || {}
  
  // Создаем полный объект плана для проверки
  const planWithData = {
    name: plan.name,
    features,
    limits
  }
  
  // Получаем все функции из конфигурации в едином порядке
  const configFeatures = SUBSCRIPTION_FEATURES_CONFIG.map(config => {
    const result = config.checkFunction(planWithData)
    
    // Для Free плана добавляем недоступную функцию "безлимитные записи"
    if (config.key === 'bookings' && plan.name === 'Free') {
      return [
        result,
        { available: false, text: 'безлимитные записи' }
      ]
    }
    
    return result
  }).flat()
  
  // Получаем service_functions из плана
  const planServiceFunctionIds = features.service_functions || []
  
  // Создаем массив функций из service_functions
  // Используем функции из реального плана подписки (включая AlwaysFree)
  const serviceFeatures = serviceFunctions.map(func => ({
    available: planServiceFunctionIds.includes(func.id),
    text: func.display_name || func.name,
    description: func.description,
    display_order: func.display_order || 0,
    id: func.id
  }))
  
  // Объединяем все функции
  const allFeatures = [...configFeatures, ...serviceFeatures]
  
  // Сортируем: сначала доступные, потом недоступные
  // Внутри каждой группы сортируем по display_order, затем по id
  const availableFeatures = allFeatures
    .filter(f => f.available)
    .sort((a, b) => {
      const orderA = a.display_order || 0
      const orderB = b.display_order || 0
      if (orderA !== orderB) return orderA - orderB
      return (a.id || 0) - (b.id || 0)
    })
  
  const unavailableFeatures = allFeatures
    .filter(f => !f.available)
    .sort((a, b) => {
      const orderA = a.display_order || 0
      const orderB = b.display_order || 0
      if (orderA !== orderB) return orderA - orderB
      return (a.id || 0) - (b.id || 0)
    })
  
  return [...availableFeatures, ...unavailableFeatures]
}

/**
 * Получить список функций тарифа по имени (для обратной совместимости)
 * @deprecated Используйте getPlanFeatures с объектом плана
 */
export function getPlanFeaturesByName(planName, features = {}, limits = {}) {
  return getPlanFeatures({
    name: planName,
    features,
    limits
  })
}


