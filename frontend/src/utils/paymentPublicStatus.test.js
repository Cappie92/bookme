import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  buildPublicStatusQuery,
  fetchPaymentPublicStatus,
  parsePaymentSuccessQuery,
  resolvePaymentVerifyState,
} from './paymentPublicStatus'

describe('paymentPublicStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parsePaymentSuccessQuery reads payment public_id', () => {
    const params = new URLSearchParams('payment=abc-public-id')
    expect(parsePaymentSuccessQuery(params)).toEqual({
      paymentPublicId: 'abc-public-id',
      invoiceId: null,
    })
  })

  it('parsePaymentSuccessQuery reads Robokassa InvId and inv_id fallback', () => {
    expect(parsePaymentSuccessQuery(new URLSearchParams('InvId=20'))).toEqual({
      paymentPublicId: null,
      invoiceId: '20',
    })
    expect(parsePaymentSuccessQuery(new URLSearchParams('inv_id=15'))).toEqual({
      paymentPublicId: null,
      invoiceId: '15',
    })
  })

  it('buildPublicStatusQuery prefers payment over invoice_id', () => {
    expect(
      buildPublicStatusQuery({ paymentPublicId: 'pub1', invoiceId: '20' }).toString()
    ).toBe('payment=pub1')
    expect(buildPublicStatusQuery({ invoiceId: '20' }).toString()).toBe('invoice_id=20')
  })

  it('fetchPaymentPublicStatus uses public_id lookup', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'paid',
        subscription_apply_status: 'applied',
        payment_source: 'web',
      }),
    })

    const result = await fetchPaymentPublicStatus({ paymentPublicId: 'pub-123' })

    expect(fetch).toHaveBeenCalledWith('/api/payments/public-status?payment=pub-123')
    expect(result.kind).toBe('ok')
    expect(resolvePaymentVerifyState(result)).toBe('success')
  })

  it('fetchPaymentPublicStatus uses invoice_id lookup for Robokassa Success URL', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'paid',
        subscription_apply_status: 'applied',
        payment_source: 'web',
      }),
    })

    const search = new URLSearchParams(
      'OutSum=1160.00&InvId=20&SignatureValue=abc&IsTest=1&Culture=ru'
    )
    const { paymentPublicId, invoiceId } = parsePaymentSuccessQuery(search)
    expect(paymentPublicId).toBeNull()
    expect(invoiceId).toBe('20')

    const result = await fetchPaymentPublicStatus({ paymentPublicId, invoiceId })

    expect(fetch).toHaveBeenCalledWith('/api/payments/public-status?invoice_id=20')
    expect(resolvePaymentVerifyState(result)).toBe('success')
  })

  it('fetchPaymentPublicStatus returns not_found for unknown invoice_id', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Payment not found' }),
    })

    const result = await fetchPaymentPublicStatus({ invoiceId: '999999' })

    expect(result.kind).toBe('not_found')
    expect(resolvePaymentVerifyState(result)).toBe('not_found')
  })

  it('fetchPaymentPublicStatus accepts legacy string public_id argument', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'paid',
        subscription_apply_status: 'applied',
        payment_source: 'web',
      }),
    })

    await fetchPaymentPublicStatus('legacy-pub-id')

    expect(fetch).toHaveBeenCalledWith('/api/payments/public-status?payment=legacy-pub-id')
  })
})
