import React, { useState } from 'react'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { formatMoney } from '../utils/formatMoney'
import { financeSummaryDemo, financeOperationsDemo } from 'shared/demo'

/**
 * Демо-режим раздела «Финансы» — статичные данные без API.
 */
export default function MasterAccountingDemo() {
  const [selectedPeriod] = useState('week')

  const chartData = Object.entries(financeSummaryDemo.income_by_date || {}).map(([date, income]) => ({
    date: date.slice(5),
    income: income || 0,
    expense: (financeSummaryDemo.expense_by_date || {})[date] || 0,
  }))

  const ops = financeOperationsDemo.slice(0, 10)

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap gap-2 text-sm text-amber-600">
        <span>Период: {selectedPeriod === 'week' ? 'Неделя' : selectedPeriod}</span>
        <span>• Демо</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="mb-1 text-xs text-gray-600 sm:text-sm">Подтвержденные доходы</div>
          <div className="text-xl font-bold text-green-600 sm:text-2xl lg:text-3xl">
            {formatMoney(financeSummaryDemo.total_income)}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="mb-1 text-xs text-gray-600 sm:text-sm">Ожидаемые доходы</div>
          <div className="text-xl font-bold text-blue-600 sm:text-2xl lg:text-3xl">
            {formatMoney(financeSummaryDemo.total_expected_income)}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="mb-1 text-xs text-gray-600 sm:text-sm">Расходы</div>
          <div className="text-xl font-bold text-red-600 sm:text-2xl lg:text-3xl">
            {formatMoney(financeSummaryDemo.total_expense)}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="mb-1 text-xs text-gray-600 sm:text-sm">Списано баллов</div>
          <div className="text-xl font-bold text-orange-600 sm:text-2xl lg:text-3xl">
            {formatMoney(financeSummaryDemo.total_points_spent)}
          </div>
        </div>
      </div>
      <div className="rounded-lg bg-white p-4 shadow sm:p-6">
        <h3 className="mb-3 text-base font-medium sm:mb-4 sm:text-lg">Доходы и расходы по дням</h3>
        <div className="w-full min-w-0 overflow-x-auto">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Доход" fill="#4CAF50" />
              <Bar dataKey="expense" name="Расход" fill="#f44336" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-lg bg-white p-4 shadow sm:p-6">
        <h3 className="mb-3 text-base font-medium sm:mb-4 sm:text-lg">Операции</h3>
        <div className="divide-y divide-gray-100 lg:hidden">
          {ops.map((op) => (
            <div key={op.id} className="space-y-2 py-4 first:pt-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-xs text-gray-500">{op.date}</span>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    op.type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {op.type === 'income' ? 'Доход' : 'Расход'}
                </span>
              </div>
              <p className="break-words font-medium text-gray-900">{op.name}</p>
              <p
                className={`text-sm font-semibold ${op.type === 'income' ? 'text-green-600' : 'text-red-600'}`}
              >
                {op.type === 'income' ? '+' : ''}
                {formatMoney(op.amount)}
              </p>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Дата</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Описание</th>
                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Тип</th>
                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {ops.map((op) => (
                <tr key={op.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-sm">{op.date}</td>
                  <td className="px-4 py-2 text-sm">{op.name}</td>
                  <td className="px-4 py-2 text-sm">{op.type === 'income' ? 'Доход' : 'Расход'}</td>
                  <td
                    className={`px-4 py-2 text-right text-sm font-medium ${
                      op.type === 'income' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {op.type === 'income' ? '+' : ''}
                    {formatMoney(op.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
