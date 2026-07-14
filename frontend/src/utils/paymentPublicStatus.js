/**
 * Публичная проверка статуса оплаты (без auth) для return URL в системном браузере.
 */

/**
 * @param {URLSearchParams|{get:(key:string)=>string|null}} searchParams
 */
export function parsePaymentSuccessQuery(searchParams) {
  const paymentPublicId = (searchParams.get('payment') || '').trim() || null
  const invoiceId =
    (searchParams.get('InvId') || searchParams.get('inv_id') || '').trim() || null
  return { paymentPublicId, invoiceId }
}

/**
 * @param {{ paymentPublicId?: string|null, invoiceId?: string|null }} lookup
 */
export function buildPublicStatusQuery(lookup = {}) {
  const params = new URLSearchParams()
  const paymentPublicId = (lookup.paymentPublicId || '').trim()
  const invoiceId = (lookup.invoiceId || '').trim()
  if (paymentPublicId) {
    params.set('payment', paymentPublicId)
  } else if (invoiceId) {
    params.set('invoice_id', invoiceId)
  }
  return params
}

/**
 * @param {{ paymentPublicId?: string|null, invoiceId?: string|null }|string|null} lookup
 */
export async function fetchPaymentPublicStatus(lookup = {}) {
  const normalized =
    typeof lookup === 'string' ? { paymentPublicId: lookup } : lookup || {}
  const paymentPublicId = (normalized.paymentPublicId || '').trim() || null
  const invoiceId = (normalized.invoiceId || '').trim() || null

  if (!paymentPublicId && !invoiceId) {
    return { kind: 'not_found' }
  }

  const params = buildPublicStatusQuery({ paymentPublicId, invoiceId })
  if (!params.toString()) {
    return { kind: 'not_found' }
  }

  const response = await fetch(`/api/payments/public-status?${params}`)
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
