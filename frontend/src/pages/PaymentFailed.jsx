import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Header from '../components/Header'

function PaymentFailed() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paymentId = searchParams.get('payment_id')
  const [countdown, setCountdown] = useState(10)

  useEffect(() => {
    // Таймер обратного отсчета
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          // Восстанавливаем состояние модального окна из localStorage
          if (paymentId) {
            const savedState = localStorage.getItem(`payment_state_${paymentId}`)
            if (savedState) {
              try {
                const state = JSON.parse(savedState)
                // Переходим в ЛК и открываем модальное окно с сохраненным состоянием
                navigate('/master/tariff', { state: { openPaymentModal: true, paymentState: state } })
              } catch (e) {
                navigate('/master/tariff')
              }
            } else {
              navigate('/master/tariff')
            }
          } else {
            navigate('/master/tariff')
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [navigate, paymentId])

  const handleGoToDashboard = () => {
    // Восстанавливаем состояние модального окна из localStorage
    if (paymentId) {
      const savedState = localStorage.getItem(`payment_state_${paymentId}`)
      if (savedState) {
        try {
          const state = JSON.parse(savedState)
          navigate('/master/tariff', { state: { openPaymentModal: true, paymentState: state } })
        } catch (e) {
          navigate('/master/tariff')
        }
      } else {
        navigate('/master/tariff')
      }
    } else {
      navigate('/master/tariff')
    }
  }

  return (
    <div className="min-h-screen bg-[#F9F7F6] flex flex-col">
      <Header />
      <div className="flex-grow flex items-center justify-center px-4 py-4">
        <div className="max-w-6xl w-full">
          <div className="flex flex-col lg:flex-row items-center justify-center gap-4 lg:gap-6">
            {/* Видео слева */}
            <div className="flex-shrink-0 w-full lg:w-1/2 max-w-md flex justify-center" style={{ maxWidth: '50%' }}>
              <video
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="w-full h-auto rounded-lg"
                style={{ transform: 'scale(5)' }}
              >
                <source src="/Dedato_404.mp4" type="video/mp4" />
                Ваш браузер не поддерживает видео.
              </video>
            </div>
            
            {/* Текст справа */}
            <div className="flex-shrink-0 w-full lg:w-1/2 flex flex-col items-center lg:items-start text-center lg:text-left">
              <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
                Что-то пошло не так во время оплаты
              </h1>
              
              <p className="text-base text-gray-600 mb-6">
                Повторите попытку оплаты или вернитесь в личный кабинет
              </p>
              
              <button
                onClick={handleGoToDashboard}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors mb-4"
              >
                Личный кабинет
              </button>
              
              <p className="text-sm text-gray-500">
                Перенаправление через {countdown} сек...
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PaymentFailed

