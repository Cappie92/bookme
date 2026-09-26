/**
 * Pure helpers for public booking create recovery / same-tab idempotency.
 * Used by PublicBookingWizard; unit-tested without mounting the wizard.
 */

export const SUBMITTED_RETRY_MS = 30_000

/** Integer master-service id; invalid / empty / non-numeric → null (never a match key). */
export function normalizeMasterServiceId(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'boolean') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  return n
}

export function masterServiceIdsEqual(a, b) {
  const na = normalizeMasterServiceId(a)
  const nb = normalizeMasterServiceId(b)
  if (na == null || nb == null) return false
  return na === nb
}

export function findServiceByDraftId(services, draftServiceId) {
  if (!Array.isArray(services)) return undefined
  return services.find((s) => masterServiceIdsEqual(s?.id, draftServiceId))
}

export function isServerConfirmedBookingReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return false
  if (receipt.id == null && !String(receipt.public_reference ?? '').trim()) return false
  return true
}

export function lastBookingSuccessMatchesSlot(rec, serviceId, slot) {
  if (!isServerConfirmedBookingReceipt(rec) || !slot || serviceId == null) return false
  if (!masterServiceIdsEqual(rec.service_id, serviceId)) return false
  return rec.start_time === slot.start_time && rec.end_time === slot.end_time
}

/**
 * Restore success from a live server-confirmed receipt.
 * Empty wizard (no service, no slot, no draft) → restore.
 * New flow started (service or slot selected) → only on full slot match.
 */
export function shouldRestorePublicBookingSuccess({
  selectedService,
  selectedSlot,
  hasActiveDraft,
  receipt,
}) {
  if (!isServerConfirmedBookingReceipt(receipt)) return false
  const hasService = selectedService != null
  const hasSlot = selectedSlot != null
  if (hasService || hasSlot) {
    if (!hasService || !hasSlot) return false
    return lastBookingSuccessMatchesSlot(receipt, selectedService.id, selectedSlot)
  }
  if (hasActiveDraft) return false
  return true
}

export function isBookingSlotOccupiedMessage(msg) {
  const text = (msg || '').toString()
  if (!text) return false
  return (
    text.includes('уже занято') ||
    text.includes('уже занят') ||
    text.toLowerCase().includes('already') ||
    text.includes('занят')
  )
}

export function shouldRestoreSuccessFromOccupiedConflict({ message, receipt, serviceId, slot }) {
  if (!isBookingSlotOccupiedMessage(message)) return false
  return lastBookingSuccessMatchesSlot(receipt, serviceId, slot)
}

/**
 * Sync claim before fetch. Survives remount via draft.status=submitted in sessionStorage.
 * inFlightRef only guards the same React instance (manual × auto).
 */
export function claimPublicBookingCreateAttempt({
  inFlightRef,
  draft,
  markSubmitted,
  now = Date.now(),
}) {
  if (inFlightRef?.current) return false
  if (draft?.status === 'submitted') {
    const submittedAt = typeof draft.submitted_at === 'number' ? draft.submitted_at : 0
    const ageMs = submittedAt ? now - submittedAt : Number.POSITIVE_INFINITY
    if (ageMs <= SUBMITTED_RETRY_MS) return false
  }
  if (inFlightRef) inFlightRef.current = true
  markSubmitted?.(now)
  return true
}

export function releasePublicBookingCreateAttempt(inFlightRef) {
  if (inFlightRef) inFlightRef.current = false
}

const sharedCreateByKey = new Map()

export function publicBookingCreateKey(slug, payload) {
  return [slug, payload?.service_id, payload?.start_time, payload?.end_time].join('\0')
}

export function peekSharedPublicBookingCreate(key) {
  return sharedCreateByKey.get(key) || null
}

export function startSharedPublicBookingCreate(key, startFn) {
  const existing = sharedCreateByKey.get(key)
  if (existing) return existing
  const promise = Promise.resolve().then(startFn)
  sharedCreateByKey.set(key, promise)
  promise.finally(() => {
    if (sharedCreateByKey.get(key) === promise) sharedCreateByKey.delete(key)
  })
  return promise
}

export function resetSharedPublicBookingCreatesForTests() {
  sharedCreateByKey.clear()
}

/**
 * Same-tab create: reuse an in-flight promise across StrictMode remount,
 * otherwise claim submitted + start exactly one fetch.
 */
export function adoptOrStartPublicBookingCreate({
  key,
  inFlightRef,
  draft,
  markSubmitted,
  startFn,
  now = Date.now(),
}) {
  const existing = peekSharedPublicBookingCreate(key)
  if (existing) {
    return { promise: existing, started: false, claimed: false }
  }
  const claimed = claimPublicBookingCreateAttempt({
    inFlightRef,
    draft,
    markSubmitted,
    now,
  })
  if (!claimed) {
    return { promise: null, started: false, claimed: false }
  }
  return {
    promise: startSharedPublicBookingCreate(key, startFn),
    started: true,
    claimed: true,
  }
}

/**
 * Simulate StrictMode remount: first instance claims+fetches; second instance
 * sees submitted (and/or inFlight) and must not start another POST.
 */
export async function runCreateFetchWithRemountGuard({
  inFlightRef,
  getDraft,
  markSubmitted,
  fetchImpl,
  requestArgs,
}) {
  const claimed = claimPublicBookingCreateAttempt({
    inFlightRef,
    draft: getDraft?.() ?? null,
    markSubmitted,
  })
  if (!claimed) return { skipped: true }
  try {
    const result = await fetchImpl(...(requestArgs || []))
    return { skipped: false, result }
  } finally {
    releasePublicBookingCreateAttempt(inFlightRef)
  }
}
