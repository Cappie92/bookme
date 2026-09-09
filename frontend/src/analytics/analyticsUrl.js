// Analytics-only projection. Never mutate the URL consumed by auth/business code.
const CANONICAL_AUTH_PATHS = new Set([
  '/auth/mobile-handoff', '/auth/oauth/callback', '/verify-email',
])
const SENSITIVE_PARAMS = new Set([
  'code', 'token', 'access_token', 'refresh_token', 'ticket', 'onboarding_ticket',
  'state', 'reset_token', 'verification_token', 'email_verification_token',
])
const isSensitivePart = (part) => {
  const key = new URLSearchParams(part).keys().next().value
  return SENSITIVE_PARAMS.has(key?.toLowerCase())
}

export function analyticsSafePath(rawUrl) {
  try {
    const url = new URL(rawUrl, 'https://analytics.invalid')
    if (!['http:', 'https:'].includes(url.protocol)) return '/'
    if (CANONICAL_AUTH_PATHS.has(url.pathname.replace(/\/$/, ''))) {
      return url.pathname.replace(/\/$/, '')
    }
    // Preserve harmless query encoding/order (utm, tab, promo_code, etc.).
    const query = url.search.slice(1).split('&').filter((part) => !isSensitivePart(part)).join('&')
    const hash = url.hash.slice(1).split(/[?&]/).some(isSensitivePart) ? '' : url.hash
    return url.pathname + (query ? '?' + query : '') + hash
  } catch {
    return '/'
  }
}

export function analyticsSafeReferrer(rawUrl) {
  try {
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    // origin deliberately excludes URL username/password.
    return url.origin + analyticsSafePath(url.href)
  } catch {
    return undefined
  }
}
