/**
 * UX return flow после оплаты: CTA зависят от payment_source из public-status (не из query).
 */

export const MOBILE_APP_SUBSCRIPTIONS_DEEP_LINK = 'dedato://subscriptions'
export const WEB_MASTER_TARIFF_PATH = '/master/tariff?refresh=1'

export function isMobileAppPaymentSource(source) {
  return source === 'mobile_app'
}

export function openMobileAppSubscriptions() {
  if (typeof window === 'undefined') {
    return
  }
  window.location.href = MOBILE_APP_SUBSCRIPTIONS_DEEP_LINK
}

export function normalizePaymentSource(source) {
  return source === 'mobile_app' ? 'mobile_app' : 'web'
}
