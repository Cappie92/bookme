import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import PaymentReturnLayout, { ctaClassName } from '../components/PaymentReturnLayout'
import { PaymentReturnCtaGroup } from '../components/PaymentReturnCta'
import {
  fetchPaymentPublicStatus,
  resolvePaymentVerifyState,
} from '../utils/paymentPublicStatus'
import {
  isMobileAppPaymentSource,
  normalizePaymentSource,
  WEB_MASTER_TARIFF_PATH,
} from '../utils/paymentReturnFlow'

function PaymentFailed() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paymentPublicId = searchParams.get('payment')
  const [verifyState, setVerifyState] = useState('loading')
  const [paymentSource, setPaymentSource] = useState('web')
  const [countdown, setCountdown] = useState(10)

  const verifyPayment = useCallback(async () => {
    if (!paymentPublicId) {
      setVerifyState('idle')
      return
    }

    setVerifyState('loading')
    try {
      const result = await fetchPaymentPublicStatus(paymentPublicId)
      if (result.kind === 'ok' && result.data) {
        setPaymentSource(normalizePaymentSource(result.data.payment_source))
      }
      setVerifyState(resolvePaymentVerifyState(result))
    } catch {
      setVerifyState('error')
    }
  }, [paymentPublicId])

  const handleGoToDashboard = useCallback(() => {
    if (!isMobileAppPaymentSource(paymentSource) && paymentPublicId) {
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
    navigate(WEB_MASTER_TARIFF_PATH)
  }, [navigate, paymentPublicId, paymentSource])

  useEffect(() => {
    void verifyPayment()
  }, [verifyPayment])

  useEffect(() => {
    if (
      verifyState === 'loading' ||
      verifyState === 'success' ||
      verifyState === 'activating' ||
      verifyState === 'pending' ||
      isMobileAppPaymentSource(paymentSource)
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
  }, [handleGoToDashboard, paymentSource, verifyState])

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
            {isMobileAppPaymentSource(paymentSource)
              ? 'Платёж уже подтверждён. Вернитесь в приложение или откройте личный кабинет в браузере.'
              : 'Платёж уже подтверждён. Перейдите в личный кабинет.'}
          </p>
          <PaymentReturnCtaGroup paymentSource={paymentSource} onWebDashboard={handleGoToDashboard} />
          <button onClick={handleGoToSuccessPage} className="text-[#4CAF50] hover:text-[#43A047] font-medium w-full max-w-sm text-center mt-2">
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
          <PaymentReturnCtaGroup paymentSource={paymentSource} onWebDashboard={handleGoToDashboard} />
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
          <PaymentReturnCtaGroup paymentSource={paymentSource} onWebDashboard={handleGoToDashboard} />
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
        <PaymentReturnCtaGroup paymentSource={paymentSource} onWebDashboard={handleGoToDashboard} />
        {paymentPublicId ? (
          <button
            onClick={() => void verifyPayment()}
            className="text-[#4CAF50] hover:text-[#43A047] font-medium w-full max-w-sm text-center mb-4 mt-2"
          >
            Проверить статус ещё раз
          </button>
        ) : null}
        {!isMobileAppPaymentSource(paymentSource) ? (
          <p className="text-sm text-gray-500 break-words">
            Перенаправление через {countdown} сек…
          </p>
        ) : null}
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
