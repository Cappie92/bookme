/**
 * Чистые хелперы UI subscription points в модалке тарифа (web).
 */

export function resolveSubscriptionPointsBalance(loadedBalance, calculationAvailable) {
  if (typeof loadedBalance === 'number' && !Number.isNaN(loadedBalance) && loadedBalance >= 0) {
    return loadedBalance
  }
  if (typeof calculationAvailable === 'number' && !Number.isNaN(calculationAvailable) && calculationAvailable >= 0) {
    return calculationAvailable
  }
  return 0
}

export function shouldShowSubscriptionPointsBlock({ pointsBalance, upgradeType, selectedPlan }) {
  if (!selectedPlan) return false
  if (upgradeType !== 'immediate') return false
  return resolveSubscriptionPointsBalance(pointsBalance, null) > 0
}

export function getMaxSubscriptionPointsToUse({ pointsBalance, priceBeforePoints }) {
  const available = Math.max(0, Math.floor(Number(pointsBalance) || 0))
  const priceCap = Math.max(0, Math.floor(Number(priceBeforePoints) || 0))
  return Math.min(available, priceCap)
}

export function buildSubscriptionPointsCalculatePayload({ useSubscriptionPoints, subscriptionPointsToUse }) {
  return useSubscriptionPoints ? Math.max(0, Math.floor(Number(subscriptionPointsToUse) || 0)) : 0
}

export function formatPointsLabel(count) {
  const n = Math.abs(Math.floor(Number(count) || 0))
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return `${n} балл`
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} балла`
  return `${n} баллов`
}

export function isNoSubscriptionResponse(status, payload) {
  if (status === 200 && (payload === null || payload === undefined)) return true
  if (status !== 404) return false
  const detail = payload?.detail ?? payload?.message
  if (detail === 'no_subscription') return true
  if (typeof detail === 'string' && detail.includes('no_subscription')) return true
  return true
}

/**
 * Breakdown скидки за период (без subscription points).
 * regularTotal = ceil(price_1month) × duration; periodTotal — до списания баллов.
 */
export function computePeriodPriceBreakdown({
  price1Month,
  durationMonths,
  periodTotal,
  savingsPercent,
}) {
  const monthly1 = Math.ceil(Number(price1Month) || 0)
  const duration = Math.max(1, Math.floor(Number(durationMonths) || 1))
  const regularTotal = monthly1 * duration
  const period = Math.round(Number(periodTotal) || 0)
  const savingsAmount = Math.max(0, regularTotal - period)
  const roundedPercent =
    savingsPercent != null && !Number.isNaN(Number(savingsPercent))
      ? Math.round(Number(savingsPercent))
      : monthly1 > 0 && duration > 1 && savingsAmount > 0
        ? Math.round((savingsAmount / (monthly1 * duration)) * 100)
        : 0

  return {
    regularTotal,
    periodTotal: period,
    savingsAmount,
    savingsPercent: roundedPercent,
    showPeriodDiscount: duration > 1 && savingsAmount > 0,
  }
}
