import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Header from '../components/Header'
import Logo from '../components/ui/Logo'
import { metrikaInitOnce, metrikaGoal } from '../analytics/metrika'
import { M } from '../analytics/metrikaEvents'

function PaymentSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paymentId = searchParams.get('payment_id')
  const [countdown, setCountdown] = useState(10)
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    // Один reachGoal на успешный return URL (и при React StrictMode remount)
    const k = `dedato_ym_subscription_ok_${paymentId || 'none'}`
    if (window.sessionStorage.getItem(k) === '1') {
      return
    }
    window.sessionStorage.setItem(k, '1')
    void metrikaInitOnce().then(() => {
      metrikaGoal(M.PAYMENT_SUBSCRIPTION_SUCCESS, { payment_id: paymentId || undefined })
    })
  }, [paymentId])

  useEffect(() => {
    // Таймер обратного отсчета
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          navigate('/master/tariff?refresh=1')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [navigate])

  const handleGoToDashboard = () => {
    navigate('/master/tariff?refresh=1')
  }

  return (
    <div className="min-h-screen bg-[#F9F7F6] flex flex-col" data-testid="payment-success-page">
      <Header />
      <div className="flex-grow flex items-center justify-center px-4 py-4">
        <div className="max-w-6xl w-full">
          <div className="flex flex-col lg:flex-row items-center justify-center gap-4 lg:gap-6">
            {/* Логотип слева */}
            <div className="flex-shrink-0 w-full lg:w-1/2 max-w-md flex justify-center" style={{ maxWidth: '50%' }}>
              <div style={{ transform: 'scale(5)' }}>
                <Logo size="3xl" />
              </div>
            </div>
            
            {/* Текст справа */}
            <div className="flex-shrink-0 w-full lg:w-1/2 flex flex-col items-center lg:items-start text-center lg:text-left">
              <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
                Оплата прошла успешно
              </h1>
              
              <p className="text-base text-gray-600 mb-6">
                Сейчас вы будете перенаправлены в личный кабинет
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

export default PaymentSuccess

