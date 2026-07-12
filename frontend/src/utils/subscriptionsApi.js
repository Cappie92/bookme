/**
 * Read-only API подписок (web).
 */

import { API_BASE_URL } from './config'
import { isNoSubscriptionResponse } from './subscriptionModalPoints'

function authHeaders() {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/**
 * GET /api/subscriptions/my — null при отсутствии подписки (200 + null).
 * Обратная совместимость: legacy 404 no_subscription во время rolling deploy.
 * Другие ошибки пробрасываются.
 */
export async function fetchCurrentSubscription() {
  const response = await fetch(`${API_BASE_URL}/api/subscriptions/my`, {
    headers: authHeaders(),
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (response.ok) {
    if (payload == null) return null
    return payload
  }

  if (isNoSubscriptionResponse(response.status, payload)) {
    return null
  }

  const error = new Error(`HTTP error! status: ${response.status}`)
  error.response = { status: response.status, data: payload }
  throw error
}
