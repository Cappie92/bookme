/**
 * Единый источник правды для отображения функций тарифных планов (web + mobile).
 * Логика совпадает с веб-страницей «Мой тариф»: service_functions из API + лимит записей для Free.
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
      if (plan.name === 'Free') {
        const maxBookings = plan.limits?.max_future_bookings || 30
        return { available: true, text: `${maxBookings} активных записей` }
      }
      return { available: true, text: 'Без ограничений на запись' }
    }
  }
]

/**
 * @param {Object} plan - { name, features, limits }
 * @param {Array} serviceFunctions - из GET /api/master/service-functions?function_type=subscription
 * @param {boolean} isAlwaysFree
 * @returns {Array<{ text: string, available: boolean, display_order?: number, id?: number }>}
 */
export function getPlanFeatures(plan, serviceFunctions = [], isAlwaysFree = false) {
  if (!plan) return []

  const features = plan.features || {}
  const limits = plan.limits || {}

  const planWithData = {
    name: plan.name,
    features,
    limits
  }

  const configFeatures = SUBSCRIPTION_FEATURES_CONFIG.map(config => {
    const result = config.checkFunction(planWithData)

    if (config.key === 'bookings' && plan.name === 'Free') {
      return [
        result,
        { available: false, text: 'безлимитные записи' }
      ]
    }

    return result
  }).flat()

  const planServiceFunctionIds = features.service_functions || []

  const serviceFeatures = serviceFunctions.map(func => ({
    available: planServiceFunctionIds.includes(func.id),
    text: func.display_name || func.name,
    description: func.description,
    display_order: func.display_order || 0,
    id: func.id
  }))

  const allFeatures = [...configFeatures, ...serviceFeatures]

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
 * @deprecated Используйте getPlanFeatures с объектом плана
 */
export function getPlanFeaturesByName(planName, features = {}, limits = {}) {
  return getPlanFeatures({
    name: planName,
    features,
    limits
  })
}

/** Стабильный порядок строк матрицы «Мой тариф» (слева 4, справа 3). Согласован с backend SERVICE_FUNCTION_TO_FEATURE. */
export const TARIFF_COMPARISON_LEFT_COUNT = 4
export const TARIFF_COMPARISON_RIGHT_COUNT = 3

/**
 * @param {Record<string, any>} features — plan.features
 * @param {Record<string, any>} limits — plan.limits
 * @param {boolean} isAlwaysFree
 */
function hasServiceFunction(features, id) {
  const ids = features?.service_functions || []
  return Array.isArray(ids) && ids.includes(id)
}

/**
 * Единая матрица возможностей тарифа мастера: 7 строк, фиксированный порядок, available по плану.
 * Подписи и порядок колонок (4+3) — единый UX для web / iOS / Android.
 * Соответствие backend: SERVICE_FUNCTION_TO_FEATURE (2 статистика, 3 лояльность, 4 финансы, 5 ограничения, 6 домен, 7 клиенты).
 *
 * @param {Object|null} plan - { name?, features?, limits? }
 * @param {boolean} isAlwaysFree
 * @returns {Array<{ key: string, label: string, available: boolean }>}
 */
export function getMasterTariffComparisonRows(plan, isAlwaysFree = false) {
  const features = plan?.features || {}
  const limits = plan?.limits || {}

  const unlimitedBookingsAvailable = (() => {
    if (isAlwaysFree) return true
    const maxFuture = limits.max_future_bookings
    return maxFuture == null || maxFuture === 0
  })()

  /** Столбец 1 (4 строки), затем столбец 2 (3 строки) — см. splitTariffComparisonColumns */
  const rows = [
    {
      key: 'unlimited_bookings',
      label: 'Безлимитные записи',
      available: unlimitedBookingsAvailable,
    },
    {
      key: 'clients_list',
      label: 'Список клиентов',
      available:
        isAlwaysFree ||
        hasServiceFunction(features, 7) ||
        features.has_clients_access === true,
    },
    {
      key: 'loyalty',
      label: 'Лояльность',
      available:
        isAlwaysFree ||
        hasServiceFunction(features, 3) ||
        features.has_loyalty_access === true,
    },
    {
      key: 'finance',
      label: 'Финансы',
      available:
        isAlwaysFree ||
        hasServiceFunction(features, 4) ||
        features.has_finance_access === true,
    },
    {
      key: 'custom_domain',
      label: 'Свой домен',
      available:
        isAlwaysFree ||
        hasServiceFunction(features, 6) ||
        features.can_customize_domain === true,
    },
    {
      key: 'extended_stats',
      label: 'Статистика',
      available:
        isAlwaysFree ||
        hasServiceFunction(features, 2) ||
        features.has_extended_stats === true,
    },
    {
      key: 'client_restrictions',
      label: 'Стоп-листы и предоплата',
      available:
        isAlwaysFree ||
        hasServiceFunction(features, 5) ||
        features.has_client_restrictions === true,
    },
  ]

  return rows
}

/**
 * @param {Array<{ key: string, label: string, available: boolean }>} rows
 * @returns {{ left: typeof rows, right: typeof rows }}
 */
export function splitTariffComparisonColumns(rows) {
  const left = rows.slice(0, TARIFF_COMPARISON_LEFT_COUNT)
  const right = rows.slice(
    TARIFF_COMPARISON_LEFT_COUNT,
    TARIFF_COMPARISON_LEFT_COUNT + TARIFF_COMPARISON_RIGHT_COUNT
  )
  return { left, right }
}
