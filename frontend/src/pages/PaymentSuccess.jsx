import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import Header from '../components/Header'
import Logo from '../components/ui/Logo'
import { useAuth } from '../contexts/AuthContext'
import { metrikaInitOnce, metrikaGoal } from '../analytics/metrika'
import { M } from '../analytics/metrikaEvents'

function isPaymentConfirmed(payment) {
  if (!payment || payment.status !== 'paid') {
    return false
  }
  if (
    payment.subscription_apply_status != null &&
    payment.subscription_apply_status !== 'applied'
  ) {
    return false
  }
  return true
}

function PaymentSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paymentPublicId = searchParams.get('payment')
  const { getAuthHeaders } = useAuth()
  const [verifyState, setVerifyState] = useState('loading')
  const [countdown, setCountdown] = useState(10)

  const verifyPayment = useCallback(async () => {
    if (!paymentPublicId) {
      setVerifyState('error')
      return
    }

    setVerifyState('loading')
    try {
      const response = await fetch(
        `/api/payments/status?payment=${encodeURIComponent(paymentPublicId)}`,
        { headers: getAuthHeaders() }
      )

      if (!response.ok) {
        setVerifyState('error')
        return
      }

      const payments = await response.json()
      const payment = Array.isArray(payments)
        ? payments.find((item) => item.public_id === paymentPublicId) || payments[0]
        : null

      if (!payment) {
        setVerifyState('pending')
        return
      }

      if (isPaymentConfirmed(payment)) {
        setVerifyState('success')
        return
      }

      if (payment.status === 'pending') {
        setVerifyState('pending')
        return
      }

      setVerifyState('error')
    } catch {
      setVerifyState('error')
    }
  }, [paymentPublicId, getAuthHeaders])

  useEffect(() => {
    void verifyPayment()
  }, [verifyPayment])

  useEffect(() => {
    if (verifyState !== 'success' || typeof window === 'undefined') {
      return
    }

    const k = `dedato_ym_subscription_ok_${paymentPublicId || 'none'}`
    if (window.sessionStorage.getItem(k) === '1') {
      return
    }
    window.sessionStorage.setItem(k, '1')
    void metrikaInitOnce().then(() => {
      metrikaGoal(M.PAYMENT_SUBSCRIPTION_SUCCESS, { payment: paymentPublicId || undefined })
    })
  }, [verifyState, paymentPublicId])

  useEffect(() => {
    if (verifyState !== 'success') {
      return
    }

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
  }, [navigate, verifyState])

  const handleGoToDashboard = () => {
    navigate('/master/tariff?refresh=1')
  }

  const handleGoToFailPage = () => {
    const query = paymentPublicId ? `?payment=${encodeURIComponent(paymentPublicId)}` : ''
    navigate(`/payment/failed${query}`)
  }

  const renderContent = () => {
    if (verifyState === 'loading') {
      return (
        <>
          <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Проверяем оплату...
          </h1>
          <p className="text-base text-gray-600 mb-6">
            Подождите, подтверждаем статус платежа
          </p>
        </>
      )
    }

    if (verifyState === 'success') {
      return (
        <>
          <CheckCircleIcon className="h-14 w-14 text-[#4CAF50] mb-4" aria-hidden="true" />
          <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
            Оплата прошла успешно
          </h1>
          <p className="text-base text-gray-600 mb-6">
            Сейчас вы будете перенаправлены в личный кабинет
          </p>
          <button
            onClick={handleGoToDashboard}
            className="bg-[#4CAF50] hover:bg-[#43A047] text-white font-semibold py-3 px-8 rounded-lg transition-colors mb-4"
          >
            Личный кабинет
          </button>
          <p className="text-sm text-gray-500">
            Перенаправление через {countdown} сек...
          </p>
        </>
      )
    }

    const isPending = verifyState === 'pending'
    const title = isPending ? 'Платёж ещё не подтверждён' : 'Не удалось подтвердить оплату'
    const description = isPending
      ? 'Оплата обрабатывается. Попробуйте проверить статус ещё раз через несколько секунд.'
      : 'Не удалось получить подтверждение оплаты. Повторите проверку или вернитесь к оплате.'

    return (
      <>
        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
          {title}
        </h1>
        <p className="text-base text-gray-600 mb-6">
          {description}
        </p>
        <button
          onClick={() => void verifyPayment()}
          className="bg-[#4CAF50] hover:bg-[#43A047] text-white font-semibold py-3 px-8 rounded-lg transition-colors mb-4"
        >
          Проверить ещё раз
        </button>
        <button
          onClick={handleGoToFailPage}
          className="text-[#4CAF50] hover:text-[#43A047] font-medium mb-4"
        >
          Перейти на страницу ошибки
        </button>
      </>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9F7F6] flex flex-col" data-testid="payment-success-page">
      <Header />
      <div className="flex-grow flex items-center justify-center px-4 py-4">
        <div className="max-w-6xl w-full">
          <div className="flex flex-col lg:flex-row items-center justify-center gap-4 lg:gap-6">
            <div className="flex-shrink-0 w-full lg:w-1/2 max-w-md flex justify-center" style={{ maxWidth: '50%' }}>
              <div style={{ transform: 'scale(5)' }}>
                <Logo size="3xl" />
              </div>
            </div>

            <div className="flex-shrink-0 w-full lg:w-1/2 flex flex-col items-center lg:items-start text-center lg:text-left">
              {renderContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PaymentSuccess
