import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useAuth } from './AuthContext'
import { ADMIN_ACCESS_STATUS, canPerformAction, createAdminAccessStore } from '../utils/adminAccess'

const AdminAccessContext = createContext(null)

const readToken = () => (typeof window === 'undefined' ? null : window.localStorage.getItem('access_token'))

// Module scope: checkAuthStatus() remounts this provider, so a ref would be
// lost and a persistent 403 would loop between /users/me and /admin/access.
const recheckedIdentities = new Set()

const PENDING = Object.freeze({ status: ADMIN_ACCESS_STATUS.LOADING, access: null, identity: null })

export function AdminAccessProvider({ children }) {
  const { user, checkAuthStatus } = useAuth()
  const storeRef = useRef(null)
  if (!storeRef.current) {
    storeRef.current = createAdminAccessStore({ fetcher: (...args) => fetch(...args), getToken: readToken })
  }
  const store = storeRef.current
  const stored = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const identity = user?.id != null ? `${user.id}:${readToken() || ''}` : null
  // Until the load effect runs for a new identity, never expose the previous one's grants.
  const snapshot = stored.identity === identity ? stored : PENDING

  useEffect(() => {
    if (!identity) {
      store.reset()
      return undefined
    }
    store.load(identity)
    const onFocus = () => store.load(identity, { force: true })
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [identity, store])

  // The server no longer treats this account as staff: re-resolve the session
  // so the role guard leaves the admin shell instead of showing stale actions.
  useEffect(() => {
    if (snapshot.status === ADMIN_ACCESS_STATUS.READY && identity) {
      recheckedIdentities.delete(identity)
      return
    }
    if (snapshot.status === ADMIN_ACCESS_STATUS.FORBIDDEN && identity && !recheckedIdentities.has(identity)) {
      recheckedIdentities.add(identity)
      checkAuthStatus()
    }
  }, [snapshot.status, identity, checkAuthStatus])

  const refresh = useCallback(() => {
    if (identity) return store.load(identity, { force: true })
    return undefined
  }, [identity, store])

  const value = useMemo(() => ({
    ...snapshot,
    refresh,
    can: (action) => snapshot.status === ADMIN_ACCESS_STATUS.READY && canPerformAction(snapshot.access, action),
  }), [snapshot, refresh])

  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>
}

/** Outside the admin shell every action is denied. */
const DENY_ALL = Object.freeze({
  status: ADMIN_ACCESS_STATUS.LOADING,
  access: null,
  refresh: () => undefined,
  can: () => false,
})

export function useAdminAccess() {
  return useContext(AdminAccessContext) || DENY_ALL
}

export { AdminAccessContext }
