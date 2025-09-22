import React, { useState, useEffect } from 'react'
import { XMarkIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

const PaymentModal = ({ 
  isOpen, 
  onClose, 
  booking, 
  onPaymentComplete,
  onPaymentExpired 
}) => {
  const [timeLeft, setTimeLeft] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('card')

  useEffect(() => {
    if (!isOpen || !booking) return

    // Вычисляем время до истечения оплаты
    const calculateTimeLeft = () => {
      if (!booking.payment_deadline) return 0
      
      const now = new Date().getTime()
      const deadline = new Date(booking.payment_deadline).getTime()
      const difference = deadline - now
      
      if (difference <= 0) {
        // Время истекло
        onPaymentExpired?.(booking.id)
        onClose()
        return 0
      }
      
      return Math.floor(difference / 1000) // в секундах
    }

    // Устанавливаем начальное время
    setTimeLeft(calculateTimeLeft())

    // Обновляем каждую секунду
    const timer = setInterval(() => {
      const remaining = calculateTimeLeft()
      setTimeLeft(remaining)
      
      if (remaining <= 0) {
        clearInterval(timer)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [isOpen, booking, onPaymentExpired, onClose])

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const handlePayment = async () => {
    setIsProcessing(true)
    
    try {
      // Имитация процесса оплаты
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Здесь будет реальная логика оплаты
      console.log('Оплата прошла успешно:', {
        bookingId: booking.id,
        amount: booking.payment_amount,
        method: paymentMethod
      })
      
      onPaymentComplete?.(booking.id)
      onClose()
    } catch (error) {
      console.error('Ошибка оплаты:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    if (isProcessing) return // Не закрываем во время обработки
    onClose()
  }

  if (!isOpen || !booking) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Заголовок */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            💳 Оплата бронирования
          </h2>
          <button
            onClick={handleClose}
            disabled={isProcessing}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Содержимое */}
        <div className="p-6 space-y-6">
          {/* Информация о бронировании */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">Детали бронирования</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div>Услуга: <span className="font-medium">{booking.service_name}</span></div>
              <div>Дата: <span className="font-medium">{new Date(booking.start_time).toLocaleDateString('ru-RU')}</span></div>
              <div>Время: <span className="font-medium">{new Date(booking.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></div>
              <div>Мастер: <span className="font-medium">{booking.master_name}</span></div>
            </div>
          </div>

          {/* Сумма к оплате */}
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">
              {booking.payment_amount} ₽
            </div>
            <p className="text-sm text-gray-600 mt-1">Сумма к оплате</p>
          </div>

          {/* Таймер */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-center space-x-2">
              <ClockIcon className="h-5 w-5 text-red-600" />
              <span className="text-sm font-medium text-red-800">
                Время на оплату: {formatTime(timeLeft)}
              </span>
            </div>
            {timeLeft <= 300 && ( // 5 минут
              <div className="mt-2 text-center">
                <ExclamationTriangleIcon className="h-4 w-4 text-red-600 inline mr-1" />
                <span className="text-xs text-red-600">
                  Время истекает! Успейте оплатить бронирование
                </span>
              </div>
            )}
          </div>

          {/* Выбор способа оплаты */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Способ оплаты
            </label>
            <div className="space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="payment_method"
                  value="card"
                  checked={paymentMethod === 'card'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">💳 Банковская карта</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="radio"
                  name="payment_method"
                  value="sbp"
                  checked={paymentMethod === 'sbp'}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">📱 СБП (Система быстрых платежей)</span>
              </label>
            </div>
          </div>

          {/* Кнопка оплаты */}
          <button
            onClick={handlePayment}
            disabled={isProcessing || timeLeft <= 0}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Обработка оплаты...</span>
              </div>
            ) : (
              `Оплатить ${booking.payment_amount} ₽`
            )}
          </button>

          {/* Информация */}
          <div className="text-center text-xs text-gray-500">
            <p>После оплаты бронирование будет подтверждено автоматически</p>
            <p className="mt-1">В случае проблем с оплатой обратитесь в поддержку</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PaymentModal
