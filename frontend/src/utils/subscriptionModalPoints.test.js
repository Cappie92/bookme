import { describe, expect, it } from 'vitest'
import {
  buildSubscriptionPointsCalculatePayload,
  computePeriodPriceBreakdown,
  formatPeriodDiscountLabel,
  formatPointsLabel,
  getMaxSubscriptionPointsToUse,
  isNoSubscriptionResponse,
  resolveSubscriptionPointsBalance,
  shouldShowSubscriptionPointsBlock,
} from './subscriptionModalPoints'

describe('subscriptionModalPoints', () => {
  it('shows points block when balance=481 and immediate upgrade', () => {
    expect(
      shouldShowSubscriptionPointsBlock({
        pointsBalance: 481,
        upgradeType: 'immediate',
        selectedPlan: { id: 1 },
      })
    ).toBe(true)
  })

  it('hides points block when balance=0', () => {
    expect(
      shouldShowSubscriptionPointsBlock({
        pointsBalance: 0,
        upgradeType: 'immediate',
        selectedPlan: { id: 1 },
      })
    ).toBe(false)
  })

  it('builds calculate payload with subscription_points_to_use', () => {
    expect(
      buildSubscriptionPointsCalculatePayload({
        useSubscriptionPoints: true,
        subscriptionPointsToUse: 300,
      })
    ).toBe(300)
    expect(
      buildSubscriptionPointsCalculatePayload({
        useSubscriptionPoints: false,
        subscriptionPointsToUse: 300,
      })
    ).toBe(0)
  })

  it('caps max points by price_before_points', () => {
    expect(
      getMaxSubscriptionPointsToUse({
        pointsBalance: 481,
        priceBeforePoints: 2100,
      })
    ).toBe(481)
    expect(
      getMaxSubscriptionPointsToUse({
        pointsBalance: 481,
        priceBeforePoints: 300,
      })
    ).toBe(300)
  })

  it('prefers loaded balance over calculation fallback', () => {
    expect(resolveSubscriptionPointsBalance(481, 0)).toBe(481)
    expect(resolveSubscriptionPointsBalance(null, 120)).toBe(120)
  })

  it('treats 200 null as no subscription', () => {
    expect(isNoSubscriptionResponse(200, null)).toBe(true)
    expect(isNoSubscriptionResponse(200, { id: 1 })).toBe(false)
  })

  it('treats legacy 404 no_subscription as normal state', () => {
    expect(isNoSubscriptionResponse(404, { detail: 'no_subscription' })).toBe(true)
    expect(isNoSubscriptionResponse(200, {})).toBe(false)
    expect(isNoSubscriptionResponse(500, { detail: 'error' })).toBe(false)
  })

  it('formats points label in Russian', () => {
    expect(formatPointsLabel(481)).toBe('481 балл')
    expect(formatPointsLabel(300)).toBe('300 баллов')
    expect(formatPointsLabel(2)).toBe('2 балла')
  })

  describe('computePeriodPriceBreakdown', () => {
    it('Premium 3 months without points: 270 ₽ (8%)', () => {
      const breakdown = computePeriodPriceBreakdown({
        price1Month: 1160,
        durationMonths: 3,
        periodTotal: 3210,
        savingsPercent: 7.76,
      })
      expect(breakdown.regularTotal).toBe(3480)
      expect(breakdown.periodTotal).toBe(3210)
      expect(breakdown.savingsAmount).toBe(270)
      expect(breakdown.savingsPercent).toBe(8)
      expect(breakdown.showPeriodDiscount).toBe(true)
    })

    it('with 481 points period savings stays 270 ₽ (8%)', () => {
      const breakdown = computePeriodPriceBreakdown({
        price1Month: 1160,
        durationMonths: 3,
        periodTotal: 3210,
        savingsPercent: 8,
      })
      expect(breakdown.savingsAmount).toBe(270)
      expect(breakdown.savingsPercent).toBe(8)
      expect(breakdown.periodTotal - 481).toBe(2729)
    })

    it('Premium 1 month shows zero period discount explicitly', () => {
      const breakdown = computePeriodPriceBreakdown({
        price1Month: 1160,
        durationMonths: 1,
        periodTotal: 1160,
        savingsPercent: null,
      })
      expect(breakdown.regularTotal).toBe(1160)
      expect(breakdown.periodDiscount).toBe(0)
      expect(breakdown.periodDiscountPercent).toBe(0)
      expect(breakdown.discountedTotal).toBe(1160)
      expect(breakdown.showPeriodDiscount).toBe(true)
      expect(formatPeriodDiscountLabel(breakdown)).toBe('0 ₽ (0%)')
    })
  })
})
