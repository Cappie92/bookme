import { describe, expect, it } from 'vitest'
import {
  MASTER_TARIFF_NAV_ITEMS,
  computeMonthlyPrice,
  formatPackageSummary,
  formatPaymentBreakdown,
  formatPricePerMonth,
  isSuccessfulSubscriptionPayment,
  resolveSubscriptionCostDisplay,
  splitPaymentHistory,
} from './subscriptionBilling'

describe('subscriptionBilling', () => {
  it('computes 3210 for 3 months as 1070 ₽/мес', () => {
    const display = resolveSubscriptionCostDisplay({
      duration_months: 3,
      package_value: 3210,
      monthly_price: 1070,
    })
    expect(display.monthlyLabel).toBe('1 070 ₽/мес')
    expect(display.packageSummary).toBe('Пакет: 3 месяца за 3 210 ₽')
  })

  it('computes 3500 for 3 months as 1166.67 ₽/мес without rounding up', () => {
    expect(computeMonthlyPrice(3500, 3)).toBe(1166.67)
    expect(formatPricePerMonth(1166.67)).toBe('1 166,67 ₽/мес')
    expect(formatPricePerMonth(1070)).toBe('1 070 ₽/мес')
  })

  it('shows payment breakdown with points', () => {
    expect(formatPaymentBreakdown(2729, 481)).toBe(
      'Оплачено деньгами 2 729 ₽ + 481 баллов'
    )
    expect(
      resolveSubscriptionCostDisplay({
        duration_months: 3,
        package_value: 3210,
        monthly_price: 1070,
        amount_paid: 2729,
        points_used: 481,
      }).paymentBreakdown
    ).toBe('Оплачено деньгами 2 729 ₽ + 481 баллов')
  })

  it('splits successful and non-successful payments', () => {
    const items = [
      { status: 'paid', subscription_apply_status: 'applied', is_successful_purchase: true },
      { status: 'pending', subscription_apply_status: 'pending' },
      { status: 'failed', subscription_apply_status: 'failed' },
    ]
    const { successful, other } = splitPaymentHistory(items)
    expect(successful).toHaveLength(1)
    expect(other).toHaveLength(2)
    expect(isSuccessfulSubscriptionPayment(successful[0])).toBe(true)
    expect(isSuccessfulSubscriptionPayment(other[0])).toBe(false)
  })

  it('replaces Собственный сайт tab with История оплат', () => {
    const labels = MASTER_TARIFF_NAV_ITEMS.map((item) => item.label)
    expect(labels).toContain('История оплат')
    expect(labels).not.toContain('Собственный сайт')
    expect(MASTER_TARIFF_NAV_ITEMS.some((item) => item.id === 'website')).toBe(false)
  })

  it('formatPricePerMonth omits decimal cents for whole amounts', () => {
    expect(formatPricePerMonth(1160)).toBe('1 160 ₽/мес')
    expect(formatPackageSummary(1, 1160)).toBe('Пакет: 1 месяц за 1 160 ₽')
  })
})
