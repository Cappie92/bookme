import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import PaymentReturnLayout, {
  ctaClassName,
  secondaryLinkClassName,
} from '../components/PaymentReturnLayout'
import {
  fetchPaymentPublicStatus,
  resolvePaymentVerifyState,
} from '../utils/paymentPublicStatus'

function PaymentFailed() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paymentPublicId = searchParams.get('payment')
  const [verifyState, setVerifyState] = useState('loading')
  const [countdown, setCountdown] = useState(10)

  const verifyPayment = useCallback(async () => {
    if (!paymentPublicId) {
      setVerifyState('idle')
      return
    }

    setVerifyState('loading')
    try {
      const result = await fetchPaymentPublicStatus(paymentPublicId)
      setVerifyState(resolvePaymentVerifyState(result))
    } catch {
      setVerifyState('error')
    }
  }, [paymentPublicId])

  const handleGoToDashboard = useCallback(() => {
    if (paymentPublicId) {
      const savedState = localStorage.getItem(`payment_state_${paymentPublicId}`)
      if (savedState) {
        try {
          const state = JSON.parse(savedState)
          navigate('/master/tariff', { state: { openPaymentModal: true, paymentState: state } })
          return
        } catch {
          // fall through
        }
      }
    }
    navigate('/master/tariff')
  }, [navigate, paymentPublicId])

  useEffect(() => {
    void verifyPayment()
  }, [verifyPayment])

  useEffect(() => {
    if (
      verifyState === 'loading' ||
      verifyState === 'success' ||
      verifyState === 'activating' ||
      verifyState === 'pending'
    ) {
      return
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          handleGoToDashboard()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [handleGoToDashboard, verifyState])

  const handleGoToSuccessPage = () => {
    const query = paymentPublicId ? `?payment=${encodeURIComponent(paymentPublicId)}` : ''
    navigate(`/payment/success${query}`)
  }

  const renderContent = () => {
    if (verifyState === 'loading') {
      return (
        <>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 break-words">
            Проверяем статус оплаты…
          </h1>
          <p className="text-base text-gray-600 mb-6 break-words">
            Подождите, проверяем актуальный статус платежа
          </p>
        </>
      )
    }

    if (verifyState === 'success') {
      return (
        <>
          <CheckCircleIcon className="h-14 w-14 text-[#4CAF50] mb-4" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 break-words">
            Оплата прошла успешно
          </h1>
          <p className="text-base text-gray-600 mb-6 break-words">
            Платёж уже подтверждён. Перейдите в личный кабинет.
          </p>
          <button onClick={handleGoToDashboard} className={`${ctaClassName} mb-4`}>
            Личный кабинет
          </button>
          <button onClick={handleGoToSuccessPage} className={secondaryLinkClassName}>
            Страница успешной оплаты
          </button>
        </>
      )
    }

    if (verifyState === 'activating') {
      return (
        <>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 break-words">
            Оплата получена, активируем подписку
          </h1>
          <p className="text-base text-gray-600 mb-6 break-words">
            Платёж подтверждён, подписка активируется. Проверьте статус ещё раз через несколько секунд.
          </p>
          <button onClick={() => void verifyPayment()} className={`${ctaClassName} mb-4`}>
            Проверить ещё раз
          </button>
          <button onClick={handleGoToDashboard} className={secondaryLinkClassName}>
            Личный кабинет
          </button>
        </>
      )
    }

    if (verifyState === 'pending') {
      return (
        <>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 break-words">
            Платёж ещё обрабатывается
          </h1>
          <p className="text-base text-gray-600 mb-6 break-words">
            Оплата может ещё обрабатываться. Попробуйте проверить статус ещё раз.
          </p>
          <button onClick={() => void verifyPayment()} className={`${ctaClassName} mb-4`}>
            Проверить ещё раз
          </button>
          <button onClick={handleGoToDashboard} className={secondaryLinkClassName}>
            Личный кабинет
          </button>
        </>
      )
    }

    return (
      <>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 break-words">
          Что-то пошло не так во время оплаты
        </h1>
        <p className="text-base text-gray-600 mb-6 break-words">
          Повторите попытку оплаты или вернитесь в личный кабинет
        </p>
        <button onClick={handleGoToDashboard} className={`${ctaClassName} mb-4`}>
          Личный кабинет
        </button>
        {paymentPublicId ? (
          <button onClick={() => void verifyPayment()} className={`${secondaryLinkClassName} mb-4`}>
            Проверить статус ещё раз
          </button>
        ) : null}
        <p className="text-sm text-gray-500 break-words">
          Перенаправление через {countdown} сек…
        </p>
      </>
    )
  }

  return (
    <PaymentReturnLayout
      testId="payment-failed-page"
      media={
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="w-full h-auto rounded-lg scale-100 lg:scale-[3] xl:scale-[4] origin-center"
        >
          <source src="/Dedato_404.mp4" type="video/mp4" />
          Ваш браузер не поддерживает видео.
        </video>
      }
    >
      {renderContent()}
    </PaymentReturnLayout>
  )
}

export default PaymentFailed
