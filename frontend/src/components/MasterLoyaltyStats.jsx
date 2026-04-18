import React from 'react'
import {
  ArrowTrendingDownIcon,
  BanknotesIcon,
  GiftIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'

export default function MasterLoyaltyStats({ stats }) {
  // Если stats не передан, не показываем ничего
  if (!stats) {
    return null
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h2 className="text-xl font-semibold sm:text-2xl">Статистика</h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-6">
        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-600 sm:text-sm">Выдано баллов</p>
              <p className="mt-1 text-xl font-bold text-gray-900 sm:mt-2 sm:text-2xl">
                {stats.total_earned.toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 rounded-lg bg-green-50 p-2 sm:p-2.5">
              <GiftIcon className="h-7 w-7 text-green-600 sm:h-9 sm:w-9" strokeWidth={2} aria-hidden />
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-600 sm:text-sm">Списано баллов</p>
              <p className="mt-1 text-xl font-bold text-gray-900 sm:mt-2 sm:text-2xl">
                {stats.total_spent.toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 rounded-lg bg-red-50 p-2 sm:p-2.5">
              <ArrowTrendingDownIcon className="h-7 w-7 text-red-600 sm:h-9 sm:w-9" strokeWidth={2} aria-hidden />
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-600 sm:text-sm">Текущий баланс</p>
              <p className="mt-1 text-xl font-bold text-gray-900 sm:mt-2 sm:text-2xl">
                {stats.current_balance.toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 rounded-lg bg-blue-50 p-2 sm:p-2.5">
              <BanknotesIcon className="h-7 w-7 text-blue-600 sm:h-9 sm:w-9" strokeWidth={2} aria-hidden />
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-white p-4 shadow sm:p-6">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-600 sm:text-sm">Активных клиентов</p>
              <p className="mt-1 text-xl font-bold text-gray-900 sm:mt-2 sm:text-2xl">
                {stats.active_clients_count}
              </p>
            </div>
            <div className="flex shrink-0 rounded-lg bg-purple-50 p-2 sm:p-2.5">
              <UserGroupIcon className="h-7 w-7 text-purple-600 sm:h-9 sm:w-9" strokeWidth={2} aria-hidden />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
