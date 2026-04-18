import React, { useState } from 'react'
import { loyaltyQuickDiscountsDemo, loyaltyStatsDemo, loyaltyHistoryDemo } from 'shared/demo'

/**
 * Демо-режим раздела «Лояльность» — статичные данные без API.
 */
export default function MasterLoyaltyDemo() {
  const [activeTab, setActiveTab] = useState('discounts')

  return (
    <div className="space-y-4 sm:space-y-6">
      <h2 className="text-xl font-semibold sm:text-2xl">Лояльность</h2>
      <div className="flex flex-wrap gap-1 border-b border-gray-200 sm:gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('discounts')}
          className={`min-h-11 shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium sm:px-4 ${
            activeTab === 'discounts'
              ? 'border-b-2 border-[#4CAF50] text-[#4CAF50]'
              : 'text-gray-500'
          }`}
        >
          Скидки
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('points')}
          className={`min-h-11 shrink-0 rounded-t-lg px-3 py-2 text-sm font-medium sm:px-4 ${
            activeTab === 'points' ? 'border-b-2 border-[#4CAF50] text-[#4CAF50]' : 'text-gray-500'
          }`}
        >
          Баллы
        </button>
      </div>
      {activeTab === 'discounts' && (
        <div className="space-y-4">
          <h3 className="text-base font-medium sm:text-lg">Быстрые скидки</h3>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
            {loyaltyQuickDiscountsDemo.map((d) => (
              <div key={d.id} className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="font-medium">{d.name}</div>
                <div className="mt-1 text-sm text-gray-600">{d.discount_percent}%</div>
                <div className="mt-1 text-xs text-gray-500">
                  {d.conditions?.min_visits ? `От ${d.conditions.min_visits} визитов` : '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {activeTab === 'points' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
            <div className="rounded-lg bg-white p-4 shadow sm:p-5">
              <div className="text-xs text-gray-600 sm:text-sm">Начислено</div>
              <div className="mt-1 text-xl font-bold text-green-600 sm:text-2xl">
                {loyaltyStatsDemo.total_earned}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow sm:p-5">
              <div className="text-xs text-gray-600 sm:text-sm">Списано</div>
              <div className="mt-1 text-xl font-bold text-orange-600 sm:text-2xl">
                {loyaltyStatsDemo.total_spent}
              </div>
            </div>
            <div className="rounded-lg bg-white p-4 shadow sm:col-span-2 sm:p-5 lg:col-span-1">
              <div className="text-xs text-gray-600 sm:text-sm">Активных клиентов</div>
              <div className="mt-1 text-xl font-bold sm:text-2xl">{loyaltyStatsDemo.active_clients_count}</div>
            </div>
          </div>
          <h3 className="text-base font-medium sm:text-lg">История операций</h3>
          <div className="overflow-hidden rounded-lg bg-white shadow">
            <div className="divide-y divide-gray-100 lg:hidden">
              {loyaltyHistoryDemo.map((h) => (
                <div key={h.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-xs text-gray-500">{h.created_at}</span>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        h.points > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {h.points > 0 ? 'Начисление' : 'Списание'}
                    </span>
                  </div>
                  <p className="break-words text-sm text-gray-900">{h.client_phone}</p>
                  <p className="break-words text-sm text-gray-600">{h.description}</p>
                  <p
                    className={`text-right text-sm font-semibold ${h.points > 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {h.points > 0 ? '+' : ''}
                    {h.points}
                  </p>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Дата</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Клиент</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Описание</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Баллы</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loyaltyHistoryDemo.map((h) => (
                    <tr key={h.id}>
                      <td className="whitespace-nowrap px-4 py-2 text-sm">{h.created_at}</td>
                      <td className="px-4 py-2 text-sm">{h.client_phone}</td>
                      <td className="px-4 py-2 text-sm">{h.description}</td>
                      <td
                        className={`px-4 py-2 text-right text-sm font-medium ${
                          h.points > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {h.points > 0 ? '+' : ''}
                        {h.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
