/**
 * Отображение фактической стоимости подписки и истории оплат.
 */

import { formatMoney } from './formatMoney'

export const MASTER_TARIFF_HISTORY_SECTION_ID = 'history'

export const MASTER_TARIFF_NAV_ITEMS = [
  { id: 'subscription', label: 'Моя подписка' },
  { id: 'payment', label: 'Оплата' },
  { id: MASTER_TARIFF_HISTORY_SECTION_ID, label: 'История оплат' },
]

/**
 * @param {number|null|undefined} packageValue
 * @param {number|null|undefined} durationMonths
 */
export function computeMonthlyPrice(packageValue, durationMonths) {
  const months = Number(durationMonths)
  const value = Number(packageValue)
  if (!Number.isFinite(months) || months <= 0 || !Number.isFinite(value)) {
    return null
  }
  return Math.round((value / months) * 100) / 100
}

/**
 * @param {number|null|undefined} monthlyPrice
 */
export function formatPricePerMonth(monthlyPrice) {
  if (monthlyPrice == null || Number.isNaN(Number(monthlyPrice))) {
    return '—'
  }
  const value = Math.round(Number(monthlyPrice) * 100) / 100
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
  return `${formatted} ₽/мес`
}

/**
 * @param {number} durationMonths
 */
export function formatDurationMonthsLabel(durationMonths) {
  const months = Number(durationMonths)
  if (!Number.isFinite(months) || months <= 0) return '—'
  const mod10 = months % 10
  const mod100 = months % 100
  let word = 'месяцев'
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) word = 'месяц'
    else if (mod10 >= 2 && mod10 <= 4) word = 'месяца'
  }
  return `${months} ${word}`
}

/**
 * @param {number|null|undefined} durationMonths
 * @param {number|null|undefined} packageValue
 */
export function formatPackageSummary(durationMonths, packageValue) {
  if (durationMonths == null || packageValue == null) return null
  const durationLabel = formatDurationMonthsLabel(durationMonths)
  const amount = formatMoney(packageValue).replace(' ₽', '')
  return `Пакет: ${durationLabel} за ${amount} ₽`
}

/**
 * @param {number|null|undefined} amountPaid
 * @param {number|null|undefined} pointsUsed
 */
export function formatPaymentBreakdown(amountPaid, pointsUsed) {
  const paid = Math.round(Number(amountPaid || 0))
  const points = Math.round(Number(pointsUsed || 0))
  if (points <= 0) return null
  const paidLabel = paid > 0 ? formatMoney(paid).replace(' ₽', '') : '0'
  return `Оплачено деньгами ${paidLabel} ₽ + ${points.toLocaleString('ru-RU')} баллов`
}

/**
 * @param {{ monthly_price?: number|null, package_value?: number|null, duration_months?: number|null, amount_paid?: number|null, points_used?: number|null, price?: number|null }} subscription
 */
export function resolveSubscriptionCostDisplay(subscription) {
  if (!subscription) {
    return { monthlyLabel: '—', packageSummary: null, paymentBreakdown: null }
  }

  const monthlyPrice =
    subscription.monthly_price != null
      ? subscription.monthly_price
      : subscription.package_value != null && subscription.duration_months
        ? computeMonthlyPrice(subscription.package_value, subscription.duration_months)
        : subscription.price != null && subscription.duration_months
          ? computeMonthlyPrice(subscription.price, subscription.duration_months)
          : null

  const packageValue =
    subscription.package_value != null ? subscription.package_value : subscription.price

  return {
    monthlyLabel: formatPricePerMonth(monthlyPrice),
    packageSummary: formatPackageSummary(subscription.duration_months, packageValue),
    paymentBreakdown: formatPaymentBreakdown(subscription.amount_paid, subscription.points_used),
  }
}

/**
 * @param {{ status?: string, subscription_apply_status?: string, is_successful_purchase?: boolean }} item
 */
export function isSuccessfulSubscriptionPayment(item) {
  if (!item) return false
  if (item.is_successful_purchase === true) return true
  return item.status === 'paid' && item.subscription_apply_status === 'applied'
}

/**
 * @param {string} status
 */
export function formatPaymentStatusLabel(status) {
  switch (status) {
    case 'paid':
      return 'Оплачен'
    case 'pending':
      return 'В обработке'
    case 'failed':
      return 'Не прошёл'
    case 'cancelled':
      return 'Отменён'
    case 'expired':
      return 'Истёк'
    default:
      return status || '—'
  }
}

/**
 * @param {string} dateString
 */
export function formatHistoryDate(dateString) {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * @param {Array<{ is_successful_purchase?: boolean, status?: string, subscription_apply_status?: string }>} items
 */
export function splitPaymentHistory(items = []) {
  const successful = []
  const other = []
  for (const item of items) {
    if (isSuccessfulSubscriptionPayment(item)) {
      successful.push(item)
    } else {
      other.push(item)
    }
  }
  return { successful, other }
}
