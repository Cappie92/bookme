/**
 * Read-only API подписок (web).
 */

import { API_BASE_URL } from './config'

function authHeaders() {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/**
 * GET /api/subscriptions/my — null при отсутствии подписки (404 no_subscription).
 * Другие ошибки пробрасываются.
 */
export async function fetchCurrentSubscription() {
  const response = await fetch(`${API_BASE_URL}/api/subscriptions/my`, {
    headers: authHeaders(),
  })

  if (response.status === 404) {
    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    if (
      payload?.detail === 'no_subscription' ||
      payload?.message === 'no_subscription' ||
      (typeof payload?.detail === 'string' && payload.detail.includes('no_subscription')) ||
      payload == null
    ) {
      return null
    }
    return null
  }

  if (!response.ok) {
    const error = new Error(`HTTP error! status: ${response.status}`)
    try {
      error.response = { status: response.status, data: await response.json() }
    } catch {
      error.response = { status: response.status, data: null }
    }
    throw error
  }

  return response.json()
}
