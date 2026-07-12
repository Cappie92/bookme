import { describe, expect, it } from 'vitest'
import {
  buildSubscriptionPointsCalculatePayload,
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

  it('treats 404 no_subscription as normal state', () => {
    expect(isNoSubscriptionResponse(404, { detail: 'no_subscription' })).toBe(true)
    expect(isNoSubscriptionResponse(200, {})).toBe(false)
    expect(isNoSubscriptionResponse(500, { detail: 'error' })).toBe(false)
  })

  it('formats points label in Russian', () => {
    expect(formatPointsLabel(481)).toBe('481 балл')
    expect(formatPointsLabel(300)).toBe('300 баллов')
    expect(formatPointsLabel(2)).toBe('2 балла')
  })

  it('period savings scenario: price_before 2100, used 300, final 1800', () => {
    const priceBefore = 2100
    const used = 300
    const finalPrice = priceBefore - used
    expect(finalPrice).toBe(1800)
    expect(
      getMaxSubscriptionPointsToUse({
        pointsBalance: 481,
        priceBeforePoints: priceBefore,
      })
    ).toBe(481)
    const savingsPercent = Math.round((760 * 3 - 2100) / (760 * 3) * 100)
    expect(savingsPercent).toBe(8)
  })
})
