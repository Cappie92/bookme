import React, { useState, useEffect, useRef } from 'react'
import { XMarkIcon, ClockIcon } from '@heroicons/react/24/outline'

const PaymentModal = ({ 
  isOpen, 
  onClose, 
  bookingData, 
  onPaymentSuccess,
  onPaymentCancel 
}) => {
  const [timeLeft, setTimeLeft] = useState(20 * 60) // 20 минут в секундах
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [error, setError] = useState('')
  const intervalRef = useRef(null)

  useEffect(() => {
    if (isOpen && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleTimeExpired()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isOpen, timeLeft])

  useEffect(() => {
    // Проверяем статус временной брони каждые 5 секунд
    if (isOpen && bookingData?.temporaryBookingId) {
      const statusInterval = setInterval(() => {
        checkTemporaryBookingStatus(bookingData.temporaryBookingId)
      }, 5000)

      return () => clearInterval(statusInterval)
    }
  }, [isOpen, bookingData?.temporaryBookingId])

  const checkTemporaryBookingStatus = async (temporaryBookingId) => {
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/client/bookings/temporary/${temporaryBookingId}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.status === 'paid') {
          handlePaymentSuccess(data)
        } else if (data.status === 'expired') {
          handleTimeExpired()
        }
      }
    } catch (error) {
      console.error('Ошибка проверки статуса брони:', error)
    }
  }

  const handleTimeExpired = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    setError('Время оплаты истекло')
    setTimeout(() => {
      onClose()
      if (onPaymentCancel) {
        onPaymentCancel()
      }
    }, 2000)
  }

  const handlePaymentSuccess = async (data) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    
    setPaymentLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch(`/api/client/bookings/temporary/${data.id}/confirm-payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const booking = await response.json()
        onPaymentSuccess(booking)
        onClose()
      } else {
        const errorData = await response.json()
        setError(errorData.detail || 'Ошибка подтверждения оплаты')
      }
    } catch (error) {
      setError('Ошибка сети при подтверждении оплаты')
    } finally {
      setPaymentLoading(false)
    }
  }

  const handlePayment = async () => {
    setPaymentLoading(true)
    setError('')
    
    try {
      // TODO: Интеграция с платежной системой
      // Пока это заглушка
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // После успешной оплаты вызываем handlePaymentSuccess
      if (bookingData?.temporaryBookingId) {
        await handlePaymentSuccess({ id: bookingData.temporaryBookingId })
      }
    } catch (error) {
      setError('Ошибка обработки платежа')
      setPaymentLoading(false)
    }
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Оплата предоплаты</h2>
          <p className="text-sm text-gray-600">
            Для завершения бронирования необходимо произвести предоплату
          </p>
        </div>

        {/* Таймер */}
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ClockIcon className={`h-5 w-5 ${timeLeft < 300 ? 'text-red-600' : 'text-gray-600'}`} />
              <span className="text-sm font-medium text-gray-700">Осталось времени:</span>
            </div>
            <span className={`text-2xl font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-gray-900'}`}>
              {formatTime(timeLeft)}
            </span>
          </div>
        </div>

        {/* Информация о бронировании */}
        {bookingData && (
          <div className="mb-6 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Услуга:</span>
              <span className="font-medium">{bookingData.serviceName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Дата и время:</span>
              <span className="font-medium">
                {new Date(bookingData.startTime).toLocaleDateString('ru-RU')} в{' '}
                {new Date(bookingData.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="text-gray-600 font-semibold">К оплате:</span>
              <span className="font-bold text-xl text-blue-600">{bookingData.paymentAmount} ₽</span>
            </div>
          </div>
        )}

        {/* Форма оплаты (заглушка) */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600 text-center">
            Здесь будет форма оплаты<br />
            (Интеграция с платежной системой)
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Кнопки */}
        <div className="flex gap-3">
          <button
            onClick={handlePayment}
            disabled={paymentLoading || timeLeft === 0}
            className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
          >
            {paymentLoading ? 'Обработка...' : 'Оплатить'}
          </button>
          <button
            onClick={onClose}
            disabled={paymentLoading}
            className="px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

export default PaymentModal

