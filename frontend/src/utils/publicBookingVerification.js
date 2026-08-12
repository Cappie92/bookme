const BASE_PATH = '/api/bookings/public/verification'

async function readResponse(response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.success === false) {
    throw new Error(body.detail || body.message || 'Ошибка подтверждения телефона')
  }
  return body
}

export function isPendingPublicBooking(result) {
  return Boolean(
    result &&
    result.status === 'phone_verification_required' &&
    result.verification_kind === 'public_booking' &&
    result.verification_token &&
    result.phone &&
    !result.access_token &&
    !result.refresh_token
  )
}

export async function requestPublicBookingVerification(result, fetchImpl = fetch) {
  if (!isPendingPublicBooking(result)) {
    throw new Error('Некорректная pending booking session')
  }
  const response = await fetchImpl(`${BASE_PATH}/request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${result.verification_token}` },
  })
  const challenge = await readResponse(response)
  return Object.freeze({
    ticket: result.verification_token,
    phone: result.phone,
    callId: challenge.call_id,
  })
}

export async function confirmPublicBookingVerification(
  pending,
  phoneDigits,
  fetchImpl = fetch,
) {
  if (!pending?.ticket || !pending?.callId) {
    throw new Error('Верификация не инициирована')
  }
  const response = await fetchImpl(`${BASE_PATH}/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${pending.ticket}`,
    },
    body: JSON.stringify({ call_id: pending.callId, phone_digits: phoneDigits }),
  })
  return readResponse(response)
}

export async function cancelPublicBookingVerification(pending, fetchImpl = fetch) {
  if (!pending?.ticket) return
  await fetchImpl(`${BASE_PATH}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pending.ticket}` },
  })
}

export function installPublicBookingSession(result, storage = localStorage) {
  if (!result?.success || !result.access_token) {
    throw new Error('Booking completion did not return a verified session')
  }
  storage.setItem('access_token', result.access_token)
  if (result.needs_password_setup) storage.setItem('new_client_setup', 'true')
  if (result.needs_password_verification) {
    storage.setItem('existing_client_verification', 'true')
  }
}
