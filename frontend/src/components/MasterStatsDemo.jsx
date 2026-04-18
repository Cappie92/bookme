import React from 'react'
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { statsDemo } from 'shared/demo'
/**
 * Демо-режим раздела «Статистика» (расширенная) — статичные данные без API.
 */
export default function MasterStatsDemo() {
  return (
    <div data-testid="master-stats-demo" className="relative space-y-4 sm:space-y-6">
      <h2 className="text-xl font-semibold sm:text-2xl">Статистика</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="min-w-0 rounded-lg bg-white p-3 shadow sm:p-4">
          <div className="text-xs text-gray-600 sm:text-sm">Записи (текущая неделя)</div>
          <div className="mt-1 text-xl font-bold sm:text-2xl">{statsDemo.current_week_bookings}</div>
        </div>
        <div className="min-w-0 rounded-lg bg-white p-3 shadow sm:p-4">
          <div className="text-xs text-gray-600 sm:text-sm">Доход (текущая неделя)</div>
          <div className="mt-1 break-words text-xl font-bold text-green-600 sm:text-2xl">
            {statsDemo.current_week_income.toLocaleString()} ₽
          </div>
        </div>
        <div className="min-w-0 rounded-lg bg-white p-3 shadow sm:p-4">
          <div className="text-xs text-gray-600 sm:text-sm">Записи (прошлая)</div>
          <div className="mt-1 text-xl font-bold sm:text-2xl">{statsDemo.previous_week_bookings}</div>
        </div>
        <div className="min-w-0 rounded-lg bg-white p-3 shadow sm:p-4">
          <div className="text-xs text-gray-600 sm:text-sm">Доход (прошлая)</div>
          <div className="mt-1 break-words text-xl font-bold text-gray-600 sm:text-2xl">
            {statsDemo.previous_week_income.toLocaleString()} ₽
          </div>
        </div>
      </div>
      <div className="rounded-lg bg-white p-4 shadow sm:p-6">
        <h3 className="mb-3 text-base font-medium sm:mb-4 sm:text-lg">Динамика записей по неделям</h3>
        <div className="w-full min-w-0 overflow-x-auto">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={statsDemo.weeks_data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period_label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={36} />
              <Tooltip />
              <Bar dataKey="bookings" name="Записи" fill="#4CAF50" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <h3 className="mb-3 text-base font-medium sm:mb-4 sm:text-lg">Топ услуг по записям</h3>
          <ul className="space-y-3">
            {statsDemo.top_services_by_bookings?.map((s, i) => (
              <li
                key={i}
                className="flex flex-col gap-1 border-b border-gray-100 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
              >
                <span className="min-w-0 flex-1 break-words text-sm text-gray-900">{s.service_name}</span>
                <span className="shrink-0 text-sm font-medium sm:text-right">{s.booking_count} записей</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <h3 className="mb-3 text-base font-medium sm:mb-4 sm:text-lg">Топ услуг по доходу</h3>
          <ul className="space-y-3">
            {statsDemo.top_services_by_earnings?.map((s, i) => (
              <li
                key={i}
                className="flex flex-col gap-1 border-b border-gray-100 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
              >
                <span className="min-w-0 flex-1 break-words text-sm text-gray-900">{s.service_name}</span>
                <span className="shrink-0 break-words text-sm font-medium text-green-600 sm:text-right">
                  {s.total_earnings?.toLocaleString()} ₽
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
