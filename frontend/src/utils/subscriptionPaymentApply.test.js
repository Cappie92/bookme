import { describe, expect, it } from 'vitest'
import {
  formatSubscriptionPaymentUserError,
  resolveSubscriptionPaymentApplyMode,
} from './subscriptionPaymentApply'

describe('resolveSubscriptionPaymentApplyMode', () => {
  it('1. final_price=0 → free', () => {
    expect(
      resolveSubscriptionPaymentApplyMode({
        finalPrice: 0,
        cardPortion: 0,
        balancePortion: 0,
      })
    ).toBe('free')
  })

  it('2. full balance coverage → balance, not free', () => {
    expect(
      resolveSubscriptionPaymentApplyMode({
        finalPrice: 24,
        cardPortion: 0,
        balancePortion: 24,
      })
    ).toBe('balance')
  })

  it('3. mixed payment → robokassa', () => {
    expect(
      resolveSubscriptionPaymentApplyMode({
        finalPrice: 900,
        cardPortion: 600,
        balancePortion: 300,
      })
    ).toBe('robokassa')
  })

  it('4. after_expiry full balance → balance', () => {
    expect(
      resolveSubscriptionPaymentApplyMode({
        finalPrice: 24,
        cardPortion: 0,
        balancePortion: 24,
      })
    ).toBe('balance')
  })

  it('5. requires_payment=false without split fields but final>0 → balance (never free)', () => {
    expect(
      resolveSubscriptionPaymentApplyMode({
        finalPrice: 24,
        cardPortion: undefined,
        balancePortion: undefined,
      })
    ).toBe('balance')
  })

  it('6. NaN-safe: missing card with balance → balance', () => {
    expect(
      resolveSubscriptionPaymentApplyMode({
        finalPrice: 24,
        balancePortion: 24,
      })
    ).toBe('balance')
  })
})

describe('formatSubscriptionPaymentUserError', () => {
  it('hides technical snapshot/final_price errors', () => {
    expect(
      formatSubscriptionPaymentUserError(
        { detail: 'Snapshot требует оплату (final_price>0)' },
        'fallback'
      )
    ).not.toContain('final_price')
  })

  it('hides API path messages', () => {
    expect(
      formatSubscriptionPaymentUserError(
        { detail: 'Используйте /api/subscriptions/apply-upgrade-balance' },
        'fallback'
      )
    ).toBe('fallback')
  })
})
