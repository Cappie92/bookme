import React from 'react'
import {
  formatDurationMonthsLabel,
  formatHistoryDate,
  formatPaymentStatusLabel,
  formatPricePerMonth,
} from '../utils/subscriptionBilling'
import { formatMoney } from '../utils/formatMoney'

function formatPointsLabel(points) {
  const value = Number(points)
  if (!Number.isFinite(value) || value <= 0) return ''
  const mod100 = value % 100
  const mod10 = value % 10
  let word = 'баллов'
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) word = 'балл'
    else if (mod10 >= 2 && mod10 <= 4) word = 'балла'
  }
  return `${value.toLocaleString('ru-RU')} ${word}`
}

function formatPaidCell(item) {
  const paid = formatMoney(item.amount_paid)
  if (item.points_used > 0) {
    return `${paid} + ${formatPointsLabel(item.points_used)}`
  }
  return paid
}

function PaymentHistoryTable({ items, testIdPrefix = 'payment-history-row' }) {
  if (!items.length) {
    return null
  }

  return (
    <div className="overflow-x-auto -mx-1" data-testid={`${testIdPrefix}-table`}>
      <table className="min-w-[1100px] w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="py-2 px-2 font-medium whitespace-nowrap">Дата оплаты</th>
            <th className="py-2 px-2 font-medium whitespace-nowrap">Тариф</th>
            <th className="py-2 px-2 font-medium whitespace-nowrap">Срок пакета</th>
            <th className="py-2 px-2 font-medium whitespace-nowrap">Оплачено</th>
            <th className="py-2 px-2 font-medium whitespace-nowrap">Стоимость месяца</th>
            <th className="py-2 px-2 font-medium whitespace-nowrap">Начало</th>
            <th className="py-2 px-2 font-medium whitespace-nowrap">Окончание</th>
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
              <td className="py-2 px-2 whitespace-nowrap text-gray-900">{formatPaidCell(item)}</td>
              <td className="py-2 px-2 whitespace-nowrap text-gray-900">
                {formatPricePerMonth(item.monthly_price)}
              </td>
              <td className="py-2 px-2 whitespace-nowrap text-gray-700">
                {formatHistoryDate(item.subscription_start_date)}
              </td>
              <td className="py-2 px-2 whitespace-nowrap text-gray-700">
                {formatHistoryDate(item.subscription_end_date)}
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
