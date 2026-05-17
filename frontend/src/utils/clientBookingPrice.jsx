/**
 * Цена записи в ЛК клиента: payment_amount, резерв баллов, денежная часть.
 */
import React from 'react'

export function getBookingMoneyToPay(booking) {
  if (booking == null) return 0
  const explicit = booking.amount_to_pay
  if (explicit != null && explicit !== '') {
    return Number(explicit)
  }
  const payment = Number(booking.payment_amount ?? booking.price ?? 0)
  const pts = Number(booking.loyalty_points_used ?? 0)
  return Math.max(0, payment - pts)
}

export function getBookingLoyaltyReserved(booking) {
  return Number(booking?.loyalty_points_used ?? 0)
}

export function hasBookingLoyaltyReserve(booking) {
  return getBookingLoyaltyReserved(booking) > 0
}

/** Строка «Баллами: −N ₽» для карточки записи. */
export function formatBookingLoyaltyLine(booking) {
  const pts = getBookingLoyaltyReserved(booking)
  if (pts <= 0) return null
  return `Баллами: −${pts} ₽`
}

/**
 * Стоимость записи: денежная часть + опционально строка про баллы.
 * variant: 'default' | 'hero' (белый текст на зелёном фоне)
 */
export function ClientBookingPriceDisplay({ booking, variant = 'default', className = '' }) {
  const money = getBookingMoneyToPay(booking)
  const loyaltyLine = formatBookingLoyaltyLine(booking)
  const isHero = variant === 'hero'
  const moneyClass = isHero
    ? 'tabular-nums text-white font-semibold'
    : 'tabular-nums'
  const loyaltyClass = isHero
    ? 'text-[11px] text-white/80 mt-0.5'
    : 'text-[11px] text-[#2e7d32]'

  if (!loyaltyLine) {
    return (
      <span className={`${moneyClass} ${className}`.trim()}>
        {money} ₽
      </span>
    )
  }

  if (variant === 'inline') {
    return (
      <span className={className}>
        <span className={moneyClass}>{money} ₽</span>
        <span className="text-neutral-300 mx-1">·</span>
        <span className={loyaltyClass}>{loyaltyLine}</span>
      </span>
    )
  }

  return (
    <span className={className}>
      <span className={moneyClass}>{money} ₽</span>
      <span className={`block ${loyaltyClass}`}>{loyaltyLine}</span>
    </span>
  )
}
