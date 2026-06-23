import { apiGet, apiPost } from './api'

export const PROMO_FIRST_PAYMENT_ONLY_MESSAGE = 'Бонус по промокоду доступен только до первой оплаты подписки.'

export function getMasterReferralCode() {
  return apiGet('/api/master/referral-code')
}

export function applyMasterPromoCode(code) {
  return apiPost('/api/master/promo-code/apply', { code })
}

export function getCurrentMasterPromoCode() {
  return apiGet('/api/master/promo-code/current')
}

export function getSubscriptionPoints() {
  return apiGet('/api/master/subscription-points')
}

export function getPromoErrorMessage(error) {
  const detail = error?.response?.data?.detail
  const code = typeof detail === 'object' ? detail.code : null
  const message = typeof detail === 'object' ? detail.message : detail
  if (code === 'acquisition_promo_already_used') return PROMO_FIRST_PAYMENT_ONLY_MESSAGE
  if (code === 'first_payment_already_done') return PROMO_FIRST_PAYMENT_ONLY_MESSAGE
  if (code === 'not_eligible' || code === 'promo_not_eligible') return PROMO_FIRST_PAYMENT_ONLY_MESSAGE
  if (code === 'self_referral') return 'Нельзя применить собственный промокод.'
  if (code === 'code_not_found') return 'Промокод не найден. Проверьте код и попробуйте ещё раз.'
  if (code === 'code_inactive') return 'Этот промокод сейчас недоступен.'
  if (code === 'campaign_inactive') return 'Эта промо-кампания сейчас недоступна.'
  if (code === 'campaign_expired') return 'Срок действия промокода истёк.'
  if (code === 'code_limit_reached' || code === 'campaign_limit_reached') return 'Лимит использований промокода исчерпан.'
  if (code === 'master_only') return 'Промокод доступен только мастерам.'
  return message || 'Не удалось применить промокод. Проверьте код и попробуйте ещё раз.'
}

export function getPromoPreviewMessage(promoPreview) {
  if (!promoPreview) return ''
  if (promoPreview.eligible) {
    const points = Number(promoPreview.points_amount || 0)
    return `По промокоду: +${points.toLocaleString('ru-RU')} бонусных баллов после оплаты`
  }

  const reason = promoPreview.ineligible_reason || promoPreview.reason
  if (
    reason === 'minimum_period_3_months' ||
    reason === 'min_period_3_months' ||
    reason === 'period_too_short'
  ) {
    return 'Бонус доступен при оплате от 3 месяцев'
  }
  if (
    reason === 'first_payment_already_done' ||
    reason === 'already_paid_subscription' ||
    reason === 'acquisition_promo_already_used' ||
    reason === 'not_first_payment'
  ) {
    return PROMO_FIRST_PAYMENT_ONLY_MESSAGE
  }

  return promoPreview.label || PROMO_FIRST_PAYMENT_ONLY_MESSAGE
}
