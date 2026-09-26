import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  claimPublicBookingCreateAttempt,
  findServiceByDraftId,
  isServerConfirmedBookingReceipt,
  lastBookingSuccessMatchesSlot,
  masterServiceIdsEqual,
  normalizeMasterServiceId,
  releasePublicBookingCreateAttempt,
  resetSharedPublicBookingCreatesForTests,
  adoptOrStartPublicBookingCreate,
  publicBookingCreateKey,
  runCreateFetchWithRemountGuard,
  shouldRestorePublicBookingSuccess,
  shouldRestoreSuccessFromOccupiedConflict,
} from './publicBookingCreateLifecycle'

const SLOT = { start_time: '2030-07-01T10:00:00+03:00', end_time: '2030-07-01T10:30:00+03:00' }
const RECEIPT = {
  id: 42,
  public_reference: 'DD-42',
  service_id: 12,
  start_time: SLOT.start_time,
  end_time: SLOT.end_time,
  slug: 'master-a',
}

describe('public booking create lifecycle', () => {
  afterEach(() => {
    resetSharedPublicBookingCreatesForTests()
  })

  it('normalizes Number("12") to service id 12 and rejects invalid ids', () => {
    expect(normalizeMasterServiceId('12')).toBe(12)
    expect(normalizeMasterServiceId(12)).toBe(12)
    expect(masterServiceIdsEqual('12', 12)).toBe(true)
    expect(masterServiceIdsEqual(12, 99)).toBe(false)
    expect(normalizeMasterServiceId(null)).toBe(null)
    expect(normalizeMasterServiceId('')).toBe(null)
    expect(normalizeMasterServiceId('12abc')).toBe(null)
    expect(normalizeMasterServiceId(Number.NaN)).toBe(null)
    expect(masterServiceIdsEqual(null, 0)).toBe(false)
    expect(findServiceByDraftId([{ id: 12, name: 'Cut' }], '12')?.name).toBe('Cut')
  })

  it('treats only id or public_reference as a server-confirmed receipt', () => {
    expect(isServerConfirmedBookingReceipt({ saved_at: Date.now() })).toBe(false)
    expect(isServerConfirmedBookingReceipt({ id: 1 })).toBe(true)
    expect(isServerConfirmedBookingReceipt({ public_reference: 'ABC' })).toBe(true)
    expect(isServerConfirmedBookingReceipt(null)).toBe(false)
  })

  it('restores success on empty wizard when receipt is server-confirmed', () => {
    expect(
      shouldRestorePublicBookingSuccess({
        selectedService: null,
        selectedSlot: null,
        hasActiveDraft: false,
        receipt: RECEIPT,
      })
    ).toBe(true)
  })

  it('does not restore success when a new service is selected without a slot', () => {
    expect(
      shouldRestorePublicBookingSuccess({
        selectedService: { id: 12 },
        selectedSlot: null,
        hasActiveDraft: false,
        receipt: RECEIPT,
      })
    ).toBe(false)
  })

  it('restores success when selected service and slot fully match the receipt', () => {
    expect(
      shouldRestorePublicBookingSuccess({
        selectedService: { id: '12' },
        selectedSlot: SLOT,
        hasActiveDraft: false,
        receipt: RECEIPT,
      })
    ).toBe(true)
    expect(
      lastBookingSuccessMatchesSlot(RECEIPT, '12', SLOT)
    ).toBe(true)
  })

  it('does not restore success while an active draft exists on an empty form', () => {
    expect(
      shouldRestorePublicBookingSuccess({
        selectedService: null,
        selectedSlot: null,
        hasActiveDraft: true,
        receipt: RECEIPT,
      })
    ).toBe(false)
  })

  it('does not restore success from timestamp-only marker', () => {
    expect(
      shouldRestorePublicBookingSuccess({
        selectedService: null,
        selectedSlot: null,
        hasActiveDraft: false,
        receipt: { saved_at: Date.now(), service_id: 12, start_time: SLOT.start_time },
      })
    ).toBe(false)
  })

  it('restores success from 409 only when a matching live receipt exists', () => {
    expect(
      shouldRestoreSuccessFromOccupiedConflict({
        message: 'Выбранное время уже занято',
        receipt: RECEIPT,
        serviceId: 12,
        slot: SLOT,
      })
    ).toBe(true)
    expect(
      shouldRestoreSuccessFromOccupiedConflict({
        message: 'Выбранное время уже занято',
        receipt: null,
        serviceId: 12,
        slot: SLOT,
      })
    ).toBe(false)
    expect(
      shouldRestoreSuccessFromOccupiedConflict({
        message: 'Выбранное время уже занято',
        receipt: RECEIPT,
        serviceId: 12,
        slot: { start_time: 'other', end_time: SLOT.end_time },
      })
    ).toBe(false)
    expect(
      shouldRestoreSuccessFromOccupiedConflict({
        message: 'Мастер не работает в указанное время',
        receipt: RECEIPT,
        serviceId: 12,
        slot: SLOT,
      })
    ).toBe(false)
  })

  it('adopts the same in-flight promise across remount so fetch runs once', async () => {
    const fetchImpl = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ id: 7, public_reference: 'R7' }), 15)
        })
    )
    const payload = { service_id: 12, start_time: SLOT.start_time, end_time: SLOT.end_time }
    const key = publicBookingCreateKey('master-a', payload)
    const inFlightA = { current: false }
    const inFlightB = { current: false }
    let draft = { status: 'pending' }
    const markSubmitted = (ts) => {
      draft = { ...draft, status: 'submitted', submitted_at: ts }
    }
    const a = adoptOrStartPublicBookingCreate({
      key,
      inFlightRef: inFlightA,
      draft,
      markSubmitted,
      startFn: fetchImpl,
    })
    const b = adoptOrStartPublicBookingCreate({
      key,
      inFlightRef: inFlightB,
      draft,
      markSubmitted,
      startFn: fetchImpl,
    })
    expect(a.started).toBe(true)
    expect(b.started).toBe(false)
    expect(a.promise).toBe(b.promise)
    const [ra, rb] = await Promise.all([a.promise, b.promise])
    expect(ra).toEqual(rb)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('claims once: remount sees submitted and does not start a second fetch', async () => {
    const inFlightA = { current: false }
    let draft = { status: 'pending', submitted_at: null }
    const fetchImpl = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ ok: true, id: 1, public_reference: 'R1' }), 15)
        })
    )
    const markSubmitted = (ts) => {
      draft = { ...draft, status: 'submitted', submitted_at: ts }
    }

    const first = runCreateFetchWithRemountGuard({
      inFlightRef: inFlightA,
      getDraft: () => draft,
      markSubmitted,
      fetchImpl,
    })
    const inFlightB = { current: false }
    const second = runCreateFetchWithRemountGuard({
      inFlightRef: inFlightB,
      getDraft: () => draft,
      markSubmitted,
      fetchImpl,
    })

    const [a, b] = await Promise.all([first, second])
    expect(a.skipped).toBe(false)
    expect(b.skipped).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(draft.status).toBe('submitted')
  })

  it('same-instance inFlight blocks a second claim before fetch resolves', async () => {
    const inFlightRef = { current: false }
    let draft = { status: 'pending' }
    const fetchImpl = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 20))
    )
    const markSubmitted = (ts) => {
      draft = { ...draft, status: 'submitted', submitted_at: ts }
    }
    const first = runCreateFetchWithRemountGuard({
      inFlightRef,
      getDraft: () => draft,
      markSubmitted,
      fetchImpl,
    })
    const second = runCreateFetchWithRemountGuard({
      inFlightRef,
      getDraft: () => draft,
      markSubmitted,
      fetchImpl,
    })
    await Promise.all([first, second])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('writes a receipt only from HTTP 200 with id or public_reference', () => {
    const okBody = { id: 9, public_reference: 'OK-9' }
    expect(isServerConfirmedBookingReceipt(okBody)).toBe(true)
    expect(isServerConfirmedBookingReceipt({ detail: 'ok' })).toBe(false)
  })

  it('returns draft to pending after a failed create that is not own-slot 409', () => {
    const occupiedOwn = shouldRestoreSuccessFromOccupiedConflict({
      message: 'Сервис недоступен',
      receipt: RECEIPT,
      serviceId: 12,
      slot: SLOT,
    })
    expect(occupiedOwn).toBe(false)
    const nextStatus = occupiedOwn ? 'clear' : 'pending'
    expect(nextStatus).toBe('pending')
  })

  it('releases inFlight so a later attempt can claim after failure', () => {
    const inFlightRef = { current: false }
    expect(
      claimPublicBookingCreateAttempt({
        inFlightRef,
        draft: { status: 'pending' },
        markSubmitted: () => {},
      })
    ).toBe(true)
    expect(inFlightRef.current).toBe(true)
    releasePublicBookingCreateAttempt(inFlightRef)
    expect(inFlightRef.current).toBe(false)
    expect(
      claimPublicBookingCreateAttempt({
        inFlightRef,
        draft: { status: 'pending' },
        markSubmitted: () => {},
      })
    ).toBe(true)
  })
})
