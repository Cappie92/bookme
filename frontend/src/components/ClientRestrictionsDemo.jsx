import React from 'react'
import { rulesRestrictionsDemo, rulesAutoRulesDemo } from 'shared/demo'

/**
 * Демо-режим раздела «Правила / ограничения» — статичные данные без API.
 */
export default function ClientRestrictionsDemo() {
  const reasonLabels = { blacklist: 'Черный список', advance_payment_only: 'Только предоплата' }
  const cancelLabels = { client_no_show: 'Не пришёл', client_requested: 'Отмена клиентом' }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Правила и ограничения</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">Черный список</h3>
          <ul className="space-y-2">
            {rulesRestrictionsDemo.blacklist.map((r) => (
              <li key={r.id} className="flex justify-between items-start gap-2 border-b pb-2">
                <div>
                  <span className="font-medium">{r.client_phone}</span>
                  <span className="block text-sm text-gray-500">{r.reason}</span>
                </div>
              </li>
            ))}
            {rulesRestrictionsDemo.blacklist.length === 0 && <p className="text-gray-500">Пусто</p>}
          </ul>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium mb-4">Только предоплата</h3>
          <ul className="space-y-2">
            {rulesRestrictionsDemo.advance_payment_only.map((r) => (
              <li key={r.id} className="flex justify-between items-start gap-2 border-b pb-2">
                <div>
                  <span className="font-medium">{r.client_phone}</span>
                  <span className="block text-sm text-gray-500">{r.reason}</span>
                </div>
              </li>
            ))}
            {rulesRestrictionsDemo.advance_payment_only.length === 0 && <p className="text-gray-500">Пусто</p>}
          </ul>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium mb-4">Автоматические правила</h3>
        <ul className="space-y-3">
          {rulesAutoRulesDemo.map((r) => (
            <li key={r.id} className="flex gap-4 items-center border rounded p-3">
              <span className="text-sm text-gray-600">{cancelLabels[r.cancellation_reason] || r.cancellation_reason}</span>
              <span className="text-sm">≥{r.cancel_count} отмен за {r.period_days} дн.</span>
              <span className="text-sm font-medium">{reasonLabels[r.restriction_type] || r.restriction_type}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
