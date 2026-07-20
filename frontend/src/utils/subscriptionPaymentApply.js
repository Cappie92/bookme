/**
 * Выбор способа применения оплаты подписки по backend split.
 * requires_payment=false означает только «Robokassa не нужна», не «бесплатно».
 */

const EPS = 0.001

function toFiniteNumber(value) {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * @param {{
 *   finalPrice?: unknown,
 *   cardPortion?: unknown,
 *   balancePortion?: unknown,
 * }} params
 * @returns {'free' | 'balance' | 'robokassa'}
 */
export function resolveSubscriptionPaymentApplyMode({
  finalPrice,
  cardPortion,
  balancePortion,
} = {}) {
  const final = toFiniteNumber(finalPrice)
  const card = toFiniteNumber(cardPortion)
  const balance = toFiniteNumber(balancePortion)

  // A. Нулевая стоимость → free
  if (final != null && final <= EPS) {
    return 'free'
  }

  const cardIsZero = card == null || card <= EPS
  const balancePositive = balance != null && balance > EPS

  // B. Карта не нужна, есть покрытие балансом
  if (cardIsZero && balancePositive) {
    return 'balance'
  }

  // C. Нужна карта
  if (card != null && card > EPS) {
    return 'robokassa'
  }

  // requires_payment=false + final>0, split-поля потерялись/не пришли:
  // никогда не выбирать free (иначе 400 на apply-upgrade-free).
  if (final != null && final > EPS && cardIsZero) {
    return 'balance'
  }

  return 'robokassa'
}

/**
 * Человекочитаемая ошибка без сырого backend detail / API-путей.
 */
export function formatSubscriptionPaymentUserError(errBody, fallback) {
  const detail = errBody?.detail
  if (typeof detail === 'string') {
    if (detail.includes('final_price') || detail.includes('Snapshot требует оплату')) {
      return 'Не удалось применить тариф. Попробуйте ещё раз или выберите другой способ оплаты.'
    }
    if (detail.includes('/api/')) {
      return fallback || 'Не удалось выполнить оплату. Попробуйте позже.'
    }
    return detail
  }
  if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
    return detail.message
  }
  return fallback || 'Не удалось выполнить оплату. Попробуйте позже.'
}
