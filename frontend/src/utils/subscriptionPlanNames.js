/**
 * Утилита для получения отображаемых названий тарифных планов
 * Централизованное место для работы с display_name
 */

/**
 * Получить отображаемое название плана
 * @param {Object|string} plan - Объект плана или название плана
 * @returns {string} Отображаемое название
 */
export function getPlanDisplayName(plan) {
  if (!plan) return 'Неизвестный тариф'
  
  // Если передан объект плана
  if (typeof plan === 'object' && plan !== null) {
    return plan.display_name || plan.name || 'Неизвестный тариф'
  }
  
  // Если передан строковый идентификатор
  if (typeof plan === 'string') {
    return plan
  }
  
  return 'Неизвестный тариф'
}

/**
 * Получить отображаемое название плана (для обратной совместимости)
 * @deprecated Используйте getPlanDisplayName
 */
export function getPlanName(plan) {
  return getPlanDisplayName(plan)
}

