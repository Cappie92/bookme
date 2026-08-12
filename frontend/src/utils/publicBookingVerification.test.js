import { describe, expect, it, vi } from 'vitest'
import {
  cancelPublicBookingVerification,
  confirmPublicBookingVerification,
  installPublicBookingSession,
  isPendingPublicBooking,
  requestPublicBookingVerification,
} from './publicBookingVerification'

const pendingResponse = {
  status: 'phone_verification_required',
  verification_kind: 'public_booking',
  verification_token: 'opaque-ticket',
  phone: '+79005550000',
}

const jsonResponse = (body, ok = true) => ({ ok, json: async () => body })

describe('public booking verification boundary', () => {
  it('accepts only a pending response without an authenticated session', () => {
    expect(isPendingPublicBooking(pendingResponse)).toBe(true)
    expect(isPendingPublicBooking({ ...pendingResponse, access_token: 'too-early' })).toBe(false)
  })

  it('starts a call and returns immutable phone-bound UI state', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true, call_id: 'call-1' }))
    const pending = await requestPublicBookingVerification(pendingResponse, fetchImpl)
    expect(pending).toEqual({ ticket: 'opaque-ticket', phone: '+79005550000', callId: 'call-1' })
    expect(Object.isFrozen(pending)).toBe(true)
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/bookings/public/verification/request')
  })

  it('keeps completion separate when confirm rejects a wrong code', async () => {
    const storage = { setItem: vi.fn() }
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ detail: 'Неверный код' }, false))
    await expect(confirmPublicBookingVerification(
      { ticket: 'opaque-ticket', callId: 'call-1' }, '9999', fetchImpl,
    )).rejects.toThrow('Неверный код')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('installs a session only from successful post-proof completion', () => {
    const storage = { setItem: vi.fn() }
    installPublicBookingSession({ success: true, access_token: 'verified-token' }, storage)
    expect(storage.setItem).toHaveBeenCalledWith('access_token', 'verified-token')
    expect(() => installPublicBookingSession({ access_token: 'early' }, storage)).toThrow()
  })

  it('cancels the server-side pending state', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true })
    await cancelPublicBookingVerification({ ticket: 'opaque-ticket' }, fetchImpl)
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/bookings/public/verification/cancel')
  })
})
