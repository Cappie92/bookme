import { describe, expect, it } from 'vitest'
import {
  formatSubscriptionPointsRemaining,
  formatSubscriptionPointsSignedAmount,
  getSubscriptionPointsAmountColorClass,
  getSubscriptionPointsHistoryTitle,
  isSubscriptionPointsCredit,
  isSubscriptionPointsDebit,
} from './subscriptionPointsHistory'

describe('subscriptionPointsHistory', () => {
  const creditItem = {
    id: 1,
    direction: 'CREDIT',
    amount: 481,
    remaining_amount: 481,
    description: 'Начисление за приглашённого мастера Борис К.',
  }

  const debitItem = {
    id: 2,
    direction: 'DEBIT',
    amount: 481,
    remaining_amount: 0,
    description: 'Списание баллов на оплату подписки',
  }

  it('detects CREDIT by direction field', () => {
    expect(isSubscriptionPointsCredit(creditItem)).toBe(true)
    expect(isSubscriptionPointsDebit(creditItem)).toBe(false)
  })

  it('detects DEBIT by direction field', () => {
    expect(isSubscriptionPointsDebit(debitItem)).toBe(true)
    expect(isSubscriptionPointsCredit(debitItem)).toBe(false)
  })

  it('renders CREDIT amount in green with plus sign', () => {
    expect(formatSubscriptionPointsSignedAmount(481, 'CREDIT')).toBe('+481')
    expect(getSubscriptionPointsAmountColorClass('CREDIT')).toBe('text-green-700')
  })

  it('renders DEBIT amount in red with minus sign', () => {
    expect(formatSubscriptionPointsSignedAmount(481, 'DEBIT')).toBe('−481')
    expect(getSubscriptionPointsAmountColorClass('DEBIT')).toBe('text-red-700')
  })

  it('uses backend description as title', () => {
    expect(getSubscriptionPointsHistoryTitle(creditItem)).toBe(
      'Начисление за приглашённого мастера Борис К.'
    )
    expect(getSubscriptionPointsHistoryTitle(debitItem)).toBe('Списание баллов на оплату подписки')
  })

  it('falls back to direction-based titles when description is missing', () => {
    expect(getSubscriptionPointsHistoryTitle({ direction: 'CREDIT' })).toBe(
      'Начисление бонусных баллов'
    )
    expect(getSubscriptionPointsHistoryTitle({ direction: 'DEBIT' })).toBe(
      'Оплата подписки бонусными баллами'
    )
  })

  it('formats remaining balance label', () => {
    expect(formatSubscriptionPointsRemaining(481)).toBe('Осталось 481 баллов')
    expect(formatSubscriptionPointsRemaining(0)).toBe('Осталось 0 баллов')
  })
})
