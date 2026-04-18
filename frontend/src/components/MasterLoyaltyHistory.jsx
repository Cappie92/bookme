import React from 'react'

export default function MasterLoyaltyHistory({
  transactions = [],
  loading = false,
  error = '',
  errorType = 'error',
  skip = 0,
  limit = 50,
  hasMore = false,
  onSkipChange,
  onShowFilters,
  appliedFilters = {}
}) {
  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatExpiresDate = (dateString) => {
    if (!dateString) return 'Бесконечно'
    return formatDate(dateString)
  }

  // Показываем активные фильтры как chips (опционально)
  const hasActiveFilters = appliedFilters.clientId || appliedFilters.transactionType || appliedFilters.startDate || appliedFilters.endDate

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold sm:text-2xl">История операций</h2>
        <button
          type="button"
          onClick={onShowFilters}
          className="min-h-11 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium hover:bg-gray-50 sm:w-auto sm:py-2"
        >
          Фильтры
        </button>
      </div>

      {/* Активные фильтры (chips) */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2">
          {appliedFilters.clientId && (
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              Клиент: {appliedFilters.clientId}
            </span>
          )}
          {appliedFilters.transactionType && (
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              Тип: {appliedFilters.transactionType === 'earned' ? 'Начисление' : 'Списание'}
            </span>
          )}
          {appliedFilters.startDate && (
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              С: {appliedFilters.startDate}
            </span>
          )}
          {appliedFilters.endDate && (
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              По: {appliedFilters.endDate}
            </span>
          )}
        </div>
      )}

      {error && (
        <div className={
          error.includes('Доступ к программе лояльности') || errorType === 'warning'
            ? "bg-yellow-50 border border-yellow-200 rounded-lg p-4"
            : "bg-red-50 border border-red-200 rounded-lg p-4"
        }>
          <p
            className={
              error.includes('Доступ к программе лояльности') || errorType === 'warning'
                ? 'mb-2 break-words text-yellow-800'
                : 'break-words text-red-800'
            }
          >
            {error}
          </p>
          {error.includes('Доступ к программе лояльности') && (
            <a href="/master?tab=tariff" className="mt-2 inline-flex min-h-10 items-center font-medium text-blue-600 underline">
              Обновить подписку
            </a>
          )}
        </div>
      )}

      {/* Операции: карточки на mobile, таблица на lg+ */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-[#4CAF50]"></div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            Нет операций
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100 lg:hidden">
              {transactions.map((trans) => (
                <div key={trans.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-xs text-gray-500">{formatDate(trans.earned_at)}</span>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        trans.transaction_type === 'earned'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {trans.transaction_type === 'earned' ? 'Начисление' : 'Списание'}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900">
                    {trans.client_name || `Клиент #${trans.client_id}`}
                  </p>
                  <p className="text-sm text-gray-600">
                    Баллы:{' '}
                    <span className="font-semibold text-gray-900">
                      {trans.transaction_type === 'earned' ? '+' : '-'}
                      {trans.points}
                    </span>
                  </p>
                  {trans.service_name ? (
                    <p className="text-sm text-gray-500">Услуга: {trans.service_name}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    {trans.transaction_type === 'earned' ? (
                      <span>Срок: {formatExpiresDate(trans.expires_at)}</span>
                    ) : null}
                    {trans.booking_id ? <span>Запись: #{trans.booking_id}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Клиент
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Тип
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Баллы
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Услуга
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Истекает
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Запись
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.map((trans) => (
                  <tr key={trans.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(trans.earned_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {trans.client_name || `Клиент #${trans.client_id}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        trans.transaction_type === 'earned'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {trans.transaction_type === 'earned' ? 'Начисление' : 'Списание'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {trans.transaction_type === 'earned' ? '+' : '-'}{trans.points}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {trans.service_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {trans.transaction_type === 'earned' ? formatExpiresDate(trans.expires_at) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {trans.booking_id ? `#${trans.booking_id}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* Пагинация */}
        {!loading && transactions.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="text-center text-sm text-gray-700 sm:text-left">
              Показано {skip + 1} - {skip + transactions.length} операций
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSkipChange(Math.max(0, skip - limit))}
                disabled={skip === 0}
                className="min-h-10 flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
              >
                Назад
              </button>
              <button
                type="button"
                onClick={() => onSkipChange(skip + limit)}
                disabled={!hasMore}
                className="min-h-10 flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
              >
                Вперед
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
