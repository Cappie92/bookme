import { apiGet, apiPost } from './api'

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
  if (code === 'acquisition_promo_already_used') return 'Промокод уже применён. Бонус будет начислен после первой оплаты.'
  if (code === 'first_payment_already_done') return 'Промокод можно применить только до первой успешной оплаты подписки.'
  if (code === 'self_referral') return 'Нельзя применить собственный промокод.'
  if (code === 'code_not_found') return 'Промокод не найден. Проверьте код и попробуйте ещё раз.'
  if (code === 'code_inactive') return 'Этот промокод сейчас недоступен.'
  if (code === 'campaign_inactive') return 'Эта промо-кампания сейчас недоступна.'
  if (code === 'campaign_expired') return 'Срок действия промокода истёк.'
  if (code === 'code_limit_reached' || code === 'campaign_limit_reached') return 'Лимит использований промокода исчерпан.'
  if (code === 'master_only') return 'Промокод доступен только мастерам.'
  return message || 'Не удалось применить промокод. Проверьте код и попробуйте ещё раз.'
}
