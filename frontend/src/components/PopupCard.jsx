import React, { useState } from 'react'
import { CheckIcon, XMarkIcon, InformationCircleIcon } from '@heroicons/react/24/outline'
import { apiPost } from '../utils/api'
import { canCancelBooking, canShowFutureConfirmAction, canConfirmPostVisit, CANCELLATION_REASONS } from '../utils/bookingOutcome'
import { useToast } from '../contexts/ToastContext'

const PopupCard = ({ booking, position, visible, onClose, onCancelSuccess, onConfirmSuccess, masterSettings, onMouseEnter, onMouseLeave }) => {
  const { showToast } = useToast()
  const [showReasonPicker, setShowReasonPicker] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (!visible || !booking) return null

  const master = masterSettings?.master ?? null
  const preVisit = canShowFutureConfirmAction(booking, master)
  const postVisit = canConfirmPostVisit(booking, master)
  const showConfirm = preVisit || postVisit

  const handleConfirmClick = async () => {
    const isPreVisit = canShowFutureConfirmAction(booking, master)
    try {
      setConfirming(true)
      if (isPreVisit) {
        await apiPost(`/api/master/accounting/update-booking-status/${booking.id}?new_status=confirmed`)
        showToast('Принято', 'success', { quiet: true })
      } else {
        await apiPost(`/api/master/accounting/confirm-booking/${booking.id}`)
      }
      onClose()
      onConfirmSuccess?.()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Ошибка при подтверждении записи')
    } finally {
      setConfirming(false)
    }
  }

  const handleCancelClick = () => {
    setShowReasonPicker(true)
  }

  const handleCancelWithReason = async (reason) => {
    setShowReasonPicker(false)
    if (!reason) return
    try {
      setCancelling(true)
      await apiPost(`/api/master/accounting/cancel-booking/${booking.id}?cancellation_reason=${reason}`)
      onClose()
      onCancelSuccess?.()
    } catch (err) {
      alert(err?.response?.data?.detail || 'Ошибка при отмене записи')
    } finally {
      setCancelling(false)
    }
  }

  const showCancel = canCancelBooking(booking)

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
        transform: 'translate(-50%, -100%)',
        pointerEvents: 'auto'
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
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
          <p className="font-medium text-gray-900 flex items-center gap-1">
            {(booking.client_display_name || booking.client_name) || 'Клиент'}
            {booking.has_client_note ? (
              <span title={booking.client_note || ''} className="text-gray-900 cursor-help no-underline">
                <InformationCircleIcon className="w-4 h-4 inline" />
              </span>
            ) : null}
          </p>
          {booking.client_phone && <p className="text-sm text-gray-500 mt-0.5">{booking.client_phone}</p>}
        </div>
      </div>

      {/* Информация об услуге */}
      <div className="mb-3">
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="font-medium text-gray-900 mb-1 text-sm">
            {booking.service_name || 'Услуга'}
          </p>
          <div className="flex justify-between text-xs text-gray-600 gap-2">
            <span>{formatDuration(booking.service_duration || 60)}</span>
            {booking.service_price != null && booking.service_price !== '' && !Number.isNaN(Number(booking.service_price)) ? (
              <span className="font-medium text-green-600 shrink-0">
                {formatPrice(booking.service_price)}
              </span>
            ) : null}
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
            booking.status === 'completed' || booking.status === 'confirmed' ? 'bg-green-500' :
            booking.status === 'cancelled' ? 'bg-red-500' :
            'bg-gray-400'
          }`}></div>
          <span className="text-sm text-gray-600 capitalize">
            {booking.status === 'completed' ? 'Завершено' :
             booking.status === 'confirmed' ? 'Подтверждено' :
             booking.status === 'awaiting_confirmation' ? 'На подтверждении' :
             booking.status === 'created' ? 'Создана' :
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

      {/* Кнопки Подтвердить / Отменить */}
      {(showConfirm || showCancel) && (
        <div className="mt-3 pt-3 border-t border-gray-200 flex gap-2">
          {showConfirm && (
            <button
              onClick={handleConfirmClick}
              disabled={confirming}
              className="w-9 h-9 flex items-center justify-center bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              aria-label="Подтвердить"
            >
              {confirming ? <span className="text-xs">...</span> : <CheckIcon className="w-5 h-5" />}
            </button>
          )}
          {showCancel && (
            <button
              onClick={handleCancelClick}
              disabled={cancelling}
              className="w-9 h-9 flex items-center justify-center border border-red-600 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
              aria-label="Отменить"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {/* Модалка выбора причины */}
      {showReasonPicker && (
        <div
          className="absolute inset-0 bg-white rounded-lg p-3 border border-gray-200 z-10"
          style={{ minWidth: 280 }}
        >
          <h4 className="text-sm font-semibold mb-2">Причина отмены</h4>
          <div className="space-y-1">
            {Object.entries(CANCELLATION_REASONS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => handleCancelWithReason(key)}
                className="w-full text-left px-3 py-2 text-sm border border-gray-200 rounded hover:bg-gray-50"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowReasonPicker(false)}
            className="mt-2 w-full px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            Назад
          </button>
        </div>
      )}
    </div>
  )
}

export default PopupCard
