/**
 * Публичная проверка статуса оплаты (без auth) для return URL в системном браузере.
 */

export async function fetchPaymentPublicStatus(paymentPublicId) {
  const response = await fetch(
    `/api/payments/public-status?payment=${encodeURIComponent(paymentPublicId)}`
  )
  if (response.status === 404) {
    return { kind: 'not_found' }
  }
  if (!response.ok) {
    return { kind: 'error' }
  }
  const data = await response.json()
  return { kind: 'ok', data }
}

/**
 * @returns {'loading'|'success'|'activating'|'pending'|'failed'|'error'|'not_found'}
 */
export function resolvePaymentVerifyState(result) {
  if (!result || result.kind === 'loading') {
    return 'loading'
  }
  if (result.kind === 'not_found') {
    return 'not_found'
  }
  if (result.kind === 'error') {
    return 'error'
  }

  const payment = result.data
  if (!payment) {
    return 'error'
  }

  const { status, subscription_apply_status: applyStatus } = payment

  if (status === 'paid') {
    if (applyStatus === 'applied' || applyStatus == null || applyStatus === '') {
      return 'success'
    }
    if (applyStatus === 'pending') {
      return 'activating'
    }
    return 'error'
  }

  if (status === 'pending') {
    return 'pending'
  }

  if (status === 'failed' || status === 'cancelled' || status === 'expired') {
    return 'failed'
  }

  return 'error'
}

export function isPaymentFullyConfirmed(state) {
  return state === 'success'
}
