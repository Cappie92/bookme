/**
 * UI-хелперы истории subscription points (web).
 * Направление операции — только по полю direction (CREDIT / DEBIT).
 */

export function normalizeSubscriptionPointsDirection(direction) {
  const value = String(direction || '').trim().toUpperCase()
  if (value === 'DEBIT') return 'DEBIT'
  if (value === 'CREDIT') return 'CREDIT'
  return 'CREDIT'
}

export function isSubscriptionPointsCredit(item) {
  return normalizeSubscriptionPointsDirection(item?.direction) === 'CREDIT'
}

export function isSubscriptionPointsDebit(item) {
  return normalizeSubscriptionPointsDirection(item?.direction) === 'DEBIT'
}

export function getSubscriptionPointsHistoryTitle(item) {
  if (item?.description) return String(item.description)
  if (isSubscriptionPointsDebit(item)) return 'Оплата подписки бонусными баллами'
  return 'Начисление бонусных баллов'
}

export function getSubscriptionPointsHistorySubtitle(item) {
  const promo = item?.promo || {}
  const parts = []
  if (promo.promo_code) parts.push(`Промокод ${promo.promo_code}`)
  if (promo.campaign_type) {
    parts.push(promo.campaign_type === 'master_referral' ? 'реферальная программа' : 'промо-кампания')
  }
  if (promo.period_months) parts.push(`${promo.period_months} мес.`)
  if (promo.percent) parts.push(`${promo.percent}%`)
  return parts.join(' · ')
}

export function formatSubscriptionPointsSignedAmount(amount, direction) {
  const value = Math.abs(Math.round(Number(amount) || 0))
  const formatted = value.toLocaleString('ru-RU')
  return isSubscriptionPointsDebit({ direction }) ? `−${formatted}` : `+${formatted}`
}

export function getSubscriptionPointsAmountColorClass(direction) {
  return isSubscriptionPointsDebit({ direction }) ? 'text-red-700' : 'text-green-700'
}

export function formatSubscriptionPointsRemaining(remaining) {
  const value = Math.round(Number(remaining) || 0)
  return `Осталось ${value.toLocaleString('ru-RU')} баллов`
}
