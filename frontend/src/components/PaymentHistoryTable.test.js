import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import PaymentHistoryTable from './PaymentHistoryTable.jsx'

describe('PaymentHistoryTable', () => {
  it('renders compact table row with monthly price from API', () => {
    const html = renderToStaticMarkup(
      React.createElement(PaymentHistoryTable, {
        items: [
          {
            payment_id: 1,
            public_id: 'pay-1',
            paid_at: '2026-07-14T10:00:00',
            plan_display_name: 'Premium',
            duration_months: 3,
            amount_paid: 3210,
            points_spent: 0,
            points_earned: 0,
            package_value: 3210,
            monthly_price: 1070,
            subscription_start_date: '2026-07-12T10:00:00',
            subscription_end_date: '2026-10-10T10:00:00',
            status: 'paid',
            is_successful_purchase: true,
          },
        ],
      })
    )

    expect(html).toContain('<table')
    expect(html).toContain('Premium')
    expect(html).toContain('3 месяца')
    expect(html).toContain('1\u00a0070 ₽/мес')
    expect(html).toContain('12.07.26–10.10.26')
    expect(html).not.toContain('Начало')
    expect(html).not.toContain('Окончание')
    expect(html).toContain('min-w-[920px]')
  })

  it('renders paid amount with spent and earned points in parentheses', () => {
    const html = renderToStaticMarkup(
      React.createElement(PaymentHistoryTable, {
        items: [
          {
            payment_id: 2,
            public_id: 'pay-2',
            paid_at: '2026-07-14T10:00:00',
            plan_display_name: 'Premium',
            duration_months: 3,
            amount_paid: 2729,
            points_spent: 481,
            points_earned: 321,
            package_value: 3210,
            monthly_price: 1070,
            subscription_start_date: '2026-07-12T10:00:00',
            subscription_end_date: '2026-10-10T10:00:00',
            status: 'paid',
            is_successful_purchase: true,
          },
        ],
      })
    )

    expect(html).toContain('2 729 ₽')
    expect(html).toContain('text-red-600')
    expect(html).toContain('-481 балл')
    expect(html).toContain('text-green-600')
    expect(html).toContain('+321 балл')
  })
})
