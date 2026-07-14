import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import PaymentHistoryTable from './PaymentHistoryTable.jsx'

describe('PaymentHistoryTable', () => {
  it('renders compact table row with monthly price from package/duration', () => {
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
            points_used: 0,
            package_value: 3210,
            monthly_price: 1070,
            subscription_start_date: '2026-07-14T10:00:00',
            subscription_end_date: '2026-10-12T10:00:00',
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
    expect(html).not.toContain('rounded-lg border border-gray-200 p-4')
  })

  it('renders paid amount and points inline on one line', () => {
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
            points_used: 481,
            package_value: 3210,
            monthly_price: 1070,
            subscription_start_date: '2026-07-14T10:00:00',
            subscription_end_date: '2026-10-12T10:00:00',
            status: 'paid',
            is_successful_purchase: true,
          },
        ],
      })
    )

    expect(html).toContain('2 729 ₽ + 481 балл')
    expect(html).not.toContain('block')
    expect(html).toContain('min-w-[1100px]')
  })
})
