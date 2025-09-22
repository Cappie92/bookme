import React from 'react'

const PopupCard = ({ booking, position, visible, onClose }) => {
  if (!visible || !booking) return null

  const formatTime = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}ч ${mins}м`
    }
    return `${mins}м`
  }

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0
    }).format(price)
  }

  return (
    <div
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-72 max-w-80"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, -100%)'
      }}
    >
      {/* Заголовок карточки */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Информация о записи
        </h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Информация о клиенте */}
      <div className="mb-3">
        <div className="flex items-center">
          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center mr-2">
            <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="font-medium text-gray-900">{booking.client_name || 'Клиент'}</p>
        </div>
      </div>

      {/* Информация об услуге */}
      <div className="mb-3">
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="font-medium text-gray-900 mb-1 text-sm">
            {booking.service_name || 'Услуга'}
          </p>
          <div className="flex justify-between text-xs text-gray-600">
            <span>{formatDuration(booking.service_duration || 60)}</span>
            <span className="font-medium text-green-600">
              {formatPrice(booking.service_price || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Время записи */}
      <div className="mb-3">
        <div className="flex items-center text-sm text-gray-600">
          <svg className="w-3 h-3 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
          </span>
        </div>
      </div>

      {/* Статус записи */}
      <div className="mb-3">
        <div className="flex items-center">
          <div className={`w-2 h-2 rounded-full mr-2 ${
            booking.status === 'confirmed' ? 'bg-green-500' :
            booking.status === 'pending' ? 'bg-yellow-500' :
            booking.status === 'cancelled' ? 'bg-red-500' :
            'bg-gray-500'
          }`}></div>
          <span className="text-sm text-gray-600 capitalize">
            {booking.status === 'confirmed' ? 'Подтверждена' :
             booking.status === 'pending' ? 'Ожидает подтверждения' :
             booking.status === 'cancelled' ? 'Отменена' :
             booking.status}
          </span>
        </div>
      </div>

      {/* Дополнительная информация */}
      {booking.notes && (
        <div className="mb-3">
          <p className="text-xs text-gray-600 bg-gray-50 rounded p-2">
            {booking.notes}
          </p>
        </div>
      )}

      {/* Информация о типе записи */}
      <div className="pt-3 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {booking.salon_id ? 'Запись в салоне' : 'Личная запись'}
          </span>
          <span>
            ID: {booking.id}
          </span>
        </div>
      </div>
    </div>
  )
}

export default PopupCard
