import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import Logo from '../components/ui/Logo'
import PaymentReturnLayout, {
  ctaClassName,
  secondaryLinkClassName,
} from '../components/PaymentReturnLayout'
import { metrikaInitOnce, metrikaGoal } from '../analytics/metrika'
import { M } from '../analytics/metrikaEvents'
import {
  fetchPaymentPublicStatus,
  resolvePaymentVerifyState,
} from '../utils/paymentPublicStatus'

function PaymentSuccess() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paymentPublicId = searchParams.get('payment')
  const [verifyState, setVerifyState] = useState('loading')
  const [countdown, setCountdown] = useState(10)

  const verifyPayment = useCallback(async () => {
    if (!paymentPublicId) {
      setVerifyState('not_found')
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
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 break-words">
            Проверяем оплату…
          </h1>
          <p className="text-base text-gray-600 mb-6 break-words">
            Подождите, подтверждаем статус платежа
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
            Сейчас вы будете перенаправлены в личный кабинет
          </p>
          <button onClick={handleGoToDashboard} className={`${ctaClassName} mb-4`}>
            Личный кабинет
          </button>
          <p className="text-sm text-gray-500 break-words">
            Перенаправление через {countdown} сек…
          </p>
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
            Платёж подтверждён. Подождите несколько секунд и проверьте статус ещё раз.
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
            Оплата обрабатывается. Попробуйте проверить статус ещё раз через несколько секунд.
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

    if (verifyState === 'failed') {
      return (
        <>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 break-words">
            Оплата не завершена
          </h1>
          <p className="text-base text-gray-600 mb-6 break-words">
            Платёж не был успешно завершён. Повторите оплату или вернитесь в личный кабинет.
          </p>
          <button onClick={handleGoToFailPage} className={`${ctaClassName} mb-4`}>
            Перейти на страницу ошибки
          </button>
          <button onClick={handleGoToDashboard} className={secondaryLinkClassName}>
            Личный кабинет
          </button>
        </>
      )
    }

    const title =
      verifyState === 'not_found'
        ? 'Платёж не найден'
        : 'Не удалось проверить оплату'
    const description =
      verifyState === 'not_found'
        ? 'Проверьте ссылку или вернитесь в личный кабинет.'
        : 'Не удалось получить статус оплаты. Повторите проверку или вернитесь в личный кабинет.'

    return (
      <>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 break-words">
          {title}
        </h1>
        <p className="text-base text-gray-600 mb-6 break-words">{description}</p>
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
    <PaymentReturnLayout
      testId="payment-success-page"
      media={
        <div className="scale-100 lg:scale-[3] xl:scale-[4] origin-center">
          <Logo size="3xl" />
        </div>
      }
    >
      {renderContent()}
    </PaymentReturnLayout>
  )
}

export default PaymentSuccess
