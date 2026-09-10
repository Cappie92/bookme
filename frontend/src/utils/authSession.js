export const AUTH_STATUS = Object.freeze({
  LOADING: 'LOADING',
  ORDINARY: 'AUTHENTICATED_ORDINARY',
  IOS_APP: 'AUTHENTICATED_IOS_APP',
  ANONYMOUS: 'ANONYMOUS_CONFIRMED',
  ERROR: 'AUTH_ERROR',
})

const CONTEXT_KEY = 'dedato_ios_context'
export const IOS_CONTEXT_TTL = 30 * 60 * 1000
const LEGAL_PATHS = new Set(['/privacy-policy', '/user-agreement', '/personal-data-consent', '/account-deletion', '/marketing-consent'])
export const isSafePublicPath = (path) => LEGAL_PATHS.has(path) || ['/', '/about'].includes(path)

/** UX restriction only. Never an authorization claim and never contains credentials. */
export function readIosContext(storage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(CONTEXT_KEY))
    if (['ios_app_pending', 'ios_app'].includes(value?.kind) && value.expiresAt > now && value.expiresAt <= now + IOS_CONTEXT_TTL) return value
    storage.removeItem(CONTEXT_KEY)
  } catch { /* Missing/invalid UX marker is not an auth decision. */ }
  return null
}

export function createAuthSession({ storage, tabStorage, fetcher, path = '/', search = '', now = Date.now }) {
  let marker = readIosContext(tabStorage, now())
  const mark = (kind) => {
    marker = { kind, expiresAt: now() + IOS_CONTEXT_TTL }
    tabStorage.setItem(CONTEXT_KEY, JSON.stringify(marker))
  }
  if (path === '/auth/mobile-handoff') mark('ios_app_pending')
  if (LEGAL_PATHS.has(path) && new URLSearchParams(search).get('context') === 'ios_app') mark('ios_app')
  let generation = 0
  let controller
  let identity = storage.getItem('access_token')
  let state = { status: AUTH_STATUS.LOADING, user: null, marker }
  const listeners = new Set()
  const publish = (status, user = null) => {
    state = { status, user, marker }
    listeners.forEach((listener) => listener())
  }
  const invalidate = () => { generation += 1; controller?.abort(); identity = storage.getItem('access_token'); return generation }
  const syncOrigin = (user) => {
    if (user?.web_session_origin) tabStorage.setItem('dedato_web_session_origin', user.web_session_origin)
    else tabStorage.removeItem('dedato_web_session_origin')
  }
  const login = (user, expectedToken = storage.getItem('access_token')) => {
    if (expectedToken !== storage.getItem('access_token')) return false
    invalidate()
    if (!user?.role || ![undefined, null, '', 'web', 'ios_app'].includes(user.web_session_origin)) {
      publish(AUTH_STATUS.ERROR)
      return false
    }
    syncOrigin(user)
    publish(user?.web_session_origin === 'ios_app' ? AUTH_STATUS.IOS_APP : AUTH_STATUS.ORDINARY, user)
    return true
  }
  const check = async () => {
    if (state.status === AUTH_STATUS.IOS_APP && !storage.getItem('access_token')) mark('ios_app')
    const current = invalidate()
    const token = identity
    if (marker?.kind === 'ios_app_pending') { publish(AUTH_STATUS.ERROR); return }
    if (!token) { syncOrigin(null); publish(AUTH_STATUS.ANONYMOUS); return }
    controller = new AbortController()
    const signal = controller.signal
    const valid = () => current === generation && token === storage.getItem('access_token') && !signal.aborted
    publish(AUTH_STATUS.LOADING)
    try {
      const response = await fetcher('/api/auth/users/me', {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, signal,
      })
      if (!response.ok) throw new Error('Auth resolution failed')
      const user = await response.json()
      if (!valid()) return
      if (!user || !user.role || ![undefined, null, '', 'web', 'ios_app'].includes(user.web_session_origin)) throw new Error('Unknown session origin')
      syncOrigin(user)
      if (user.role) storage.setItem('user_role', user.role)
      if (user.is_demo_session === true) storage.setItem('demo_mode', '1')
      else storage.removeItem('demo_mode')
      publish(user.web_session_origin === 'ios_app' ? AUTH_STATUS.IOS_APP : AUTH_STATUS.ORDINARY, user)
    } catch {
      // Keep the credential on transport/server/auth errors: failure is NOT anonymous.
      if (valid()) publish(AUTH_STATUS.ERROR)
    }
  }
  return {
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    check,
    login,
    prepareLogin: () => { invalidate(); publish(AUTH_STATUS.LOADING) },
    logout: () => {
      if (state.status === AUTH_STATUS.IOS_APP) mark('ios_app')
      invalidate(); syncOrigin(null); publish(AUTH_STATUS.ANONYMOUS)
    },
    sync: () => { if (identity !== storage.getItem('access_token')) return check() },
    dispose: () => controller?.abort(),
    beginHandoff: () => {
      const current = invalidate()
      const token = identity
      mark('ios_app_pending')
      publish(AUTH_STATUS.LOADING)
      return {
        complete: (data) => {
          if (current !== generation || token !== storage.getItem('access_token')) return false
          if (!data.access_token || !data.user?.role) throw new Error('Invalid handoff response')
          storage.setItem('access_token', data.access_token)
          if (data.refresh_token) storage.setItem('refresh_token', data.refresh_token)
          else storage.removeItem('refresh_token')
          storage.setItem('user_role', data.user.role)
          marker = null
          tabStorage.removeItem(CONTEXT_KEY)
          login({ ...data.user, web_session_origin: data.web_session_origin || null })
          return true
        },
        fail: () => { if (current === generation) publish(AUTH_STATUS.ERROR) },
      }
    },
  }
}

export function authPermissions(state) {
  const isIosAppWebSession = state.status === AUTH_STATUS.IOS_APP
  const isIosRestrictedContext = isIosAppWebSession || Boolean(state.marker)
  return {
    isIosAppWebSession,
    isIosRestrictedContext,
    commerceAllowed: !isIosRestrictedContext && [AUTH_STATUS.ORDINARY, AUTH_STATUS.ANONYMOUS].includes(state.status),
    isAuthenticated: [AUTH_STATUS.ORDINARY, AUTH_STATUS.IOS_APP].includes(state.status),
    loading: state.status === AUTH_STATUS.LOADING,
  }
}
