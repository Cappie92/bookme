import React from 'react'
import {
  formatDurationMonthsLabel,
  formatHistoryDate,
  formatPaidAmountWithPoints,
  formatPaymentStatusLabel,
  formatPeriodRange,
  formatPricePerMonth,
} from '../utils/subscriptionBilling'

function PaidAmountCell({ item }) {
  const { amountLabel, parts } = formatPaidAmountWithPoints(
    item.amount_paid,
    item.points_spent ?? item.points_used,
    item.points_earned
  )

  if (!parts.length) {
    return amountLabel
  }

  return (
    <span className="whitespace-nowrap">
      {amountLabel}{' '}
      <span>
        (
        {parts.map((part, index) => (
          <React.Fragment key={part.tone}>
            {index > 0 ? ', ' : ''}
            <span className={part.tone === 'spent' ? 'text-red-600' : 'text-green-600'}>
              {part.text}
            </span>
          </React.Fragment>
        ))}
        )
      </span>
    </span>
  )
}

function PaymentHistoryTable({ items, testIdPrefix = 'payment-history-row' }) {
  if (!items.length) {
    return null
  }

  return (
    <div className="overflow-x-auto -mx-1" data-testid={`${testIdPrefix}-table`}>
      <table className="min-w-[920px] w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="py-2 px-2 font-medium whitespace-nowrap">Дата оплаты</th>
            <th className="py-2 px-2 font-medium whitespace-nowrap">Тариф</th>
            <th className="py-2 px-2 font-medium whitespace-nowrap">Срок пакета</th>
            <th className="py-2 px-2 font-medium whitespace-nowrap">Оплачено</th>
            <th className="py-2 px-2 font-medium whitespace-nowrap">Стоимость месяца</th>
            <th className="py-2 px-2 font-medium whitespace-nowrap">Период</th>
            <th className="py-2 px-2 font-medium whitespace-nowrap">Статус</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.public_id || item.payment_id}
              className="border-b border-gray-100 hover:bg-gray-50/80"
              data-testid={`${testIdPrefix}-${item.public_id || item.payment_id}`}
            >
              <td className="py-2 px-2 whitespace-nowrap text-gray-900">
                {formatHistoryDate(item.paid_at)}
              </td>
              <td className="py-2 px-2 whitespace-nowrap text-gray-900">
                {item.plan_display_name || item.plan_name || 'Подписка'}
              </td>
              <td className="py-2 px-2 whitespace-nowrap text-gray-900">
                {formatDurationMonthsLabel(item.duration_months)}
              </td>
              <td className="py-2 px-2 whitespace-nowrap text-gray-900">
                <PaidAmountCell item={item} />
              </td>
              <td className="py-2 px-2 whitespace-nowrap text-gray-900">
                {formatPricePerMonth(item.monthly_price)}
              </td>
              <td className="py-2 px-2 whitespace-nowrap text-gray-700">
                {formatPeriodRange(item.subscription_start_date, item.subscription_end_date)}
              </td>
              <td className="py-2 px-2 whitespace-nowrap">
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    item.is_successful_purchase
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {formatPaymentStatusLabel(item.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default PaymentHistoryTable
