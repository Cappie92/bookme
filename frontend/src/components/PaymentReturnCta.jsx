import React from 'react'
import { ctaClassName, secondaryLinkClassName } from './PaymentReturnLayout'
import {
  isMobileAppPaymentSource,
  openMobileAppSubscriptions,
} from '../utils/paymentReturnFlow'

export function PaymentReturnPrimaryCta({ paymentSource, onWebDashboard, className = ctaClassName }) {
  const isApp = isMobileAppPaymentSource(paymentSource)

  return (
    <button
      type="button"
      onClick={isApp ? openMobileAppSubscriptions : onWebDashboard}
      className={className}
    >
      {isApp ? 'Вернуться в приложение' : 'Личный кабинет'}
    </button>
  )
}

export function PaymentReturnSecondaryCta({
  paymentSource,
  onWebDashboard,
  className = secondaryLinkClassName,
}) {
  if (!isMobileAppPaymentSource(paymentSource)) {
    return null
  }

  return (
    <button type="button" onClick={onWebDashboard} className={className}>
      Открыть личный кабинет в браузере
    </button>
  )
}

export function PaymentReturnCtaGroup({
  paymentSource,
  onWebDashboard,
  primaryClassName = `${ctaClassName} mb-4`,
  secondaryClassName = `${secondaryLinkClassName} mb-4`,
}) {
  return (
    <>
      <PaymentReturnPrimaryCta
        paymentSource={paymentSource}
        onWebDashboard={onWebDashboard}
        className={primaryClassName}
      />
      <PaymentReturnSecondaryCta
        paymentSource={paymentSource}
        onWebDashboard={onWebDashboard}
        className={secondaryClassName}
      />
    </>
  )
}
