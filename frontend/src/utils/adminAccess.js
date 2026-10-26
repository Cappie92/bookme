/**
 * Admin panel access for ADMIN and MODERATOR: one section/action registry and a
 * server snapshot from GET /api/admin/access.
 *
 * UX only. Hiding a section or button never authorizes anything: every admin
 * endpoint enforces its own guard on the backend. Unknown actions, unknown
 * roles, missing or non-boolean permissions all deny.
 */

export const ADMIN_ONLY = 'admin-only'

/** Action → the moderator permission the backend guard checks, or ADMIN_ONLY. */
export const ADMIN_ACTIONS = Object.freeze({
  'stats.view': 'can_view_stats',
  'users.view': 'can_view_users',
  'users.edit': 'can_edit_users',
  'users.delete': 'can_delete_users',
  // role, is_active, verification, always-free entitlement
  'users.editAuthority': ADMIN_ONLY,
  // edit/delete of ADMIN or MODERATOR accounts
  'users.manageStaff': ADMIN_ONLY,
  'alwaysFree.view': 'can_view_users',
  'blog.view': 'can_view_blog',
  'blog.create': 'can_create_blog',
  'blog.edit': 'can_edit_blog',
  'blog.delete': 'can_delete_blog',
  'blog.publish': 'can_publish_blog',
  'moderators.manage': ADMIN_ONLY,
  'functions.manage': ADMIN_ONLY,
  'promoEngine.manage': ADMIN_ONLY,
  'settings.manage': ADMIN_ONLY,
  'payments.retry': ADMIN_ONLY,
})

/** Sidebar order is also the landing order when the dashboard is not available. */
export const ADMIN_SECTIONS = Object.freeze([
  { key: 'dashboard', path: '/admin', label: 'Дашборд', action: 'stats.view' },
  { key: 'users', path: '/admin/users', label: 'Пользователи', action: 'users.view' },
  { key: 'moderators', path: '/admin/moderators', label: 'Модераторы', action: 'moderators.manage' },
  { key: 'blog', path: '/admin/blog', label: 'Блог', action: 'blog.view' },
  { key: 'stats', path: '/admin/stats', label: 'Статистика', action: 'stats.view' },
  { key: 'functions', path: '/admin/functions', label: 'Функции', action: 'functions.manage' },
  { key: 'promo-engine', path: '/admin/promo-engine', label: 'Промокоды', action: 'promoEngine.manage' },
  { key: 'always-free-logs', path: '/admin/always-free-logs', label: 'Логи всегда бесплатно', action: 'alwaysFree.view' },
  { key: 'settings', path: '/admin/settings', label: 'Настройки', action: 'settings.manage' },
])

const STAFF_ROLES = new Set(['admin', 'moderator'])
const KNOWN_PERMISSIONS = new Set(Object.values(ADMIN_ACTIONS).filter((rule) => rule !== ADMIN_ONLY))

export const ADMIN_ROLE_LABELS = Object.freeze({ admin: 'Администратор', moderator: 'Модератор' })

export function normalizeRole(role) {
  return (role || '').toString().toLowerCase()
}

export function isStaffRole(role) {
  return STAFF_ROLES.has(normalizeRole(role))
}

/** Only an exact staff role and permissions that are literally `true` survive. */
export function normalizeAccess(payload) {
  const role = typeof payload?.role === 'string' ? payload.role : ''
  if (!STAFF_ROLES.has(role)) return null
  const source = payload.permissions && typeof payload.permissions === 'object' ? payload.permissions : {}
  const permissions = {}
  for (const name of KNOWN_PERMISSIONS) permissions[name] = source[name] === true
  return Object.freeze({ role, permissions: Object.freeze(permissions) })
}

export function canPerformAction(access, action) {
  const rule = ADMIN_ACTIONS[action]
  if (!rule || !access) return false
  if (access.role === 'admin') return true
  if (access.role !== 'moderator' || rule === ADMIN_ONLY) return false
  return access.permissions?.[rule] === true
}

export function getAdminSection(key) {
  return ADMIN_SECTIONS.find((section) => section.key === key) || null
}

export function canAccessSection(access, key) {
  const section = getAdminSection(key)
  return Boolean(section) && canPerformAction(access, section.action)
}

export function accessibleSections(access) {
  return ADMIN_SECTIONS.filter((section) => canPerformAction(access, section.action))
}

export function firstAccessibleSection(access) {
  return accessibleSections(access)[0] || null
}

/** Editing or deleting an ADMIN/MODERATOR account is ADMIN-only on the backend. */
export function canManageUserTarget(access, action, target) {
  if (!canPerformAction(access, action)) return false
  return !isStaffRole(target?.role) || canPerformAction(access, 'users.manageStaff')
}

export const ADMIN_ACCESS_STATUS = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  FORBIDDEN: 'forbidden',
  UNAUTHORIZED: 'unauthorized',
  ERROR: 'error',
})

/**
 * What the shell renders for a section.
 * allow | loading | unauthorized | not-staff | error | redirect(to) | forbidden(fallback) | empty
 */
export function resolveAdminSection(snapshot, key) {
  const status = snapshot?.status
  if (status === ADMIN_ACCESS_STATUS.LOADING || !status) return { type: 'loading' }
  if (status === ADMIN_ACCESS_STATUS.UNAUTHORIZED) return { type: 'unauthorized' }
  if (status === ADMIN_ACCESS_STATUS.FORBIDDEN) return { type: 'not-staff' }
  if (status !== ADMIN_ACCESS_STATUS.READY || !snapshot.access) return { type: 'error' }
  if (canAccessSection(snapshot.access, key)) return { type: 'allow' }
  const first = firstAccessibleSection(snapshot.access)
  if (key === 'dashboard') return first ? { type: 'redirect', to: first.path } : { type: 'empty' }
  return first ? { type: 'forbidden', fallback: first } : { type: 'empty' }
}

export async function fetchAdminAccess(fetcher, token, signal) {
  if (!token) return { status: ADMIN_ACCESS_STATUS.UNAUTHORIZED, access: null }
  let response
  try {
    response = await fetcher('/api/admin/access', {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return { status: ADMIN_ACCESS_STATUS.ERROR, access: null }
  }
  if (response.status === 401) return { status: ADMIN_ACCESS_STATUS.UNAUTHORIZED, access: null }
  if (response.status === 403) return { status: ADMIN_ACCESS_STATUS.FORBIDDEN, access: null }
  if (!response.ok) return { status: ADMIN_ACCESS_STATUS.ERROR, access: null }
  let access = null
  try {
    access = normalizeAccess(await response.json())
  } catch {
    access = null
  }
  return access
    ? { status: ADMIN_ACCESS_STATUS.READY, access }
    : { status: ADMIN_ACCESS_STATUS.ERROR, access: null }
}

/**
 * Snapshot store keyed by identity (user id + token). A response for an older
 * identity or an older request never replaces a newer one, and switching
 * identity drops the previous grants before the new request starts.
 */
export function createAdminAccessStore({ fetcher, getToken }) {
  let state = { status: ADMIN_ACCESS_STATUS.LOADING, access: null, identity: null }
  let generation = 0
  let controller = null
  const listeners = new Set()
  const publish = (next) => {
    state = next
    listeners.forEach((listener) => listener())
  }

  const load = async (identity, { force = false } = {}) => {
    if (!force && identity === state.identity && state.status !== ADMIN_ACCESS_STATUS.LOADING) return
    const current = ++generation
    controller?.abort()
    controller = typeof AbortController === 'undefined' ? null : new AbortController()
    const background = identity === state.identity && state.status === ADMIN_ACCESS_STATUS.READY
    if (!background) {
      publish({ status: ADMIN_ACCESS_STATUS.LOADING, access: null, identity })
    }
    const token = getToken()
    try {
      const result = await fetchAdminAccess(fetcher, token, controller?.signal)
      if (current !== generation) return
      if (token !== getToken()) {
        // The session changed under this request: drop grants and let the
        // next load for the new identity start from scratch.
        publish({ status: ADMIN_ACCESS_STATUS.LOADING, access: null, identity: null })
        return
      }
      // A transient failure of a background refresh must not tear down an
      // open page; explicit server decisions (401/403/new grants) still apply.
      if (background && result.status === ADMIN_ACCESS_STATUS.ERROR) return
      publish({ ...result, identity })
    } catch {
      // Aborted by a newer request; that request publishes.
    }
  }

  return {
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => state,
    load,
    reset: () => {
      generation += 1
      controller?.abort()
      publish({ status: ADMIN_ACCESS_STATUS.LOADING, access: null, identity: null })
    },
    dispose: () => { generation += 1; controller?.abort() },
  }
}
