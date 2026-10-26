import { describe, expect, it, vi } from 'vitest'
import {
  ADMIN_ACCESS_STATUS,
  ADMIN_ACTIONS,
  ADMIN_ONLY,
  ADMIN_SECTIONS,
  accessibleSections,
  canAccessSection,
  canManageUserTarget,
  canPerformAction,
  createAdminAccessStore,
  fetchAdminAccess,
  firstAccessibleSection,
  isStaffRole,
  normalizeAccess,
  resolveAdminSection,
} from './adminAccess'
import { masterWorkspaceDecision } from '../components/MasterWorkspaceRoute'

const moderator = (grants = {}) => normalizeAccess({ role: 'moderator', permissions: grants })
const admin = normalizeAccess({ role: 'admin', permissions: {} })
const ALL_GRANTS = Object.fromEntries(
  Object.values(ADMIN_ACTIONS).filter((rule) => rule !== ADMIN_ONLY).map((name) => [name, true]),
)
const sectionKeys = (access) => accessibleSections(access).map((section) => section.key)

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('normalizeAccess trusts only exact server values', () => {
  it.each([
    [null], [{}], [{ role: 'client' }], [{ role: 'master' }], [{ role: 'ADMIN' }], [{ role: 'Moderator' }],
  ])('rejects %j', (payload) => {
    expect(normalizeAccess(payload)).toBeNull()
  })

  it('keeps only literal true for known permissions', () => {
    const access = normalizeAccess({
      role: 'moderator',
      permissions: { can_view_users: true, can_edit_users: 'true', can_view_blog: 1, can_grant_admin: true },
    })
    expect(access.permissions.can_view_users).toBe(true)
    expect(access.permissions.can_edit_users).toBe(false)
    expect(access.permissions.can_view_blog).toBe(false)
    expect(access.permissions).not.toHaveProperty('can_grant_admin')
    expect(Object.isFrozen(access.permissions)).toBe(true)
  })

  it('missing permissions object means nothing is granted', () => {
    expect(sectionKeys(normalizeAccess({ role: 'moderator' }))).toEqual([])
  })
})

describe('canPerformAction', () => {
  it('ADMIN can perform every registered action', () => {
    for (const action of Object.keys(ADMIN_ACTIONS)) expect(canPerformAction(admin, action)).toBe(true)
  })

  it('MODERATOR never gets admin-only actions, even with every permission', () => {
    const everything = moderator(ALL_GRANTS)
    for (const [action, rule] of Object.entries(ADMIN_ACTIONS)) {
      expect(canPerformAction(everything, action)).toBe(rule !== ADMIN_ONLY)
    }
    for (const action of ['users.editAuthority', 'users.manageStaff', 'payments.retry',
      'promoEngine.manage', 'functions.manage', 'moderators.manage', 'settings.manage']) {
      expect(canPerformAction(everything, action)).toBe(false)
    }
  })

  it.each(Object.entries(ADMIN_ACTIONS).filter(([, rule]) => rule !== ADMIN_ONLY))(
    '%s follows only %s', (action, rule) => {
      expect(canPerformAction(moderator({ [rule]: true }), action)).toBe(true)
      expect(canPerformAction(moderator({}), action)).toBe(false)
      const others = { ...ALL_GRANTS, [rule]: false }
      expect(canPerformAction(moderator(others), action)).toBe(false)
    },
  )

  it('unknown action, no access and non-staff deny', () => {
    expect(canPerformAction(admin, 'users.grantAdmin')).toBe(false)
    expect(canPerformAction(null, 'users.view')).toBe(false)
    expect(canPerformAction({ role: 'client', permissions: ALL_GRANTS }, 'users.view')).toBe(false)
  })

  it('dormant model flags do not open anything', () => {
    const dormant = normalizeAccess({ role: 'moderator', permissions: {
      can_ban_users: true, can_view_bookings: true, can_delete_bookings: true, can_view_settings: true,
      can_edit_settings: true, can_view_masters: true, can_view_salons: true,
      can_view_promo_codes: true, can_create_promo_codes: true,
    } })
    expect(sectionKeys(dormant)).toEqual([])
  })
})

describe('sections', () => {
  it('ADMIN sees every existing section in sidebar order', () => {
    expect(sectionKeys(admin)).toEqual(ADMIN_SECTIONS.map((section) => section.key))
  })

  it('moderator with every permission still has no admin-only sections', () => {
    expect(sectionKeys(moderator(ALL_GRANTS))).toEqual(['dashboard', 'users', 'blog', 'stats', 'always-free-logs'])
  })

  it.each([
    [{ can_view_stats: true }, ['dashboard', 'stats'], 'dashboard'],
    [{ can_view_users: true }, ['users', 'always-free-logs'], 'users'],
    [{ can_view_blog: true }, ['blog'], 'blog'],
    [{ can_edit_blog: true, can_publish_blog: true }, [], null],
    [{}, [], null],
  ])('moderator %j', (grants, keys, first) => {
    const access = moderator(grants)
    expect(sectionKeys(access)).toEqual(keys)
    expect(firstAccessibleSection(access)?.key ?? null).toBe(first)
    expect(canAccessSection(access, 'promo-engine')).toBe(false)
  })
})

describe('resolveAdminSection', () => {
  const ready = (access) => ({ status: ADMIN_ACCESS_STATUS.READY, access })

  it('maps transport states', () => {
    expect(resolveAdminSection({ status: ADMIN_ACCESS_STATUS.LOADING }, 'users')).toEqual({ type: 'loading' })
    expect(resolveAdminSection(undefined, 'users')).toEqual({ type: 'loading' })
    expect(resolveAdminSection({ status: ADMIN_ACCESS_STATUS.UNAUTHORIZED }, 'users')).toEqual({ type: 'unauthorized' })
    expect(resolveAdminSection({ status: ADMIN_ACCESS_STATUS.FORBIDDEN }, 'users')).toEqual({ type: 'not-staff' })
    expect(resolveAdminSection({ status: ADMIN_ACCESS_STATUS.ERROR }, 'users')).toEqual({ type: 'error' })
    expect(resolveAdminSection({ status: ADMIN_ACCESS_STATUS.READY, access: null }, 'users')).toEqual({ type: 'error' })
  })

  it('ADMIN lands on the dashboard', () => {
    expect(resolveAdminSection(ready(admin), 'dashboard')).toEqual({ type: 'allow' })
  })

  it('moderator without stats is redirected from /admin to the first allowed section', () => {
    expect(resolveAdminSection(ready(moderator({ can_view_blog: true })), 'dashboard'))
      .toEqual({ type: 'redirect', to: '/admin/blog' })
  })

  it('moderator without any section gets the empty state, not /master', () => {
    expect(resolveAdminSection(ready(moderator({})), 'dashboard')).toEqual({ type: 'empty' })
    expect(resolveAdminSection(ready(moderator({})), 'settings')).toEqual({ type: 'empty' })
  })

  it('forbidden deep link stays in the shell with a link to an allowed section', () => {
    const decision = resolveAdminSection(ready(moderator({ can_view_users: true })), 'settings')
    expect(decision.type).toBe('forbidden')
    expect(decision.fallback.path).toBe('/admin/users')
  })

  it('unknown section is never allowed', () => {
    expect(resolveAdminSection(ready(admin), 'support').type).not.toBe('allow')
  })
})

describe('canManageUserTarget', () => {
  const editor = moderator({ can_edit_users: true, can_delete_users: true })

  it.each(['client', 'master', 'indie', 'salon'])('moderator may manage a %s', (role) => {
    expect(canManageUserTarget(editor, 'users.edit', { role })).toBe(true)
    expect(canManageUserTarget(editor, 'users.delete', { role })).toBe(true)
  })

  it.each(['admin', 'moderator', 'ADMIN'])('moderator may not manage %s accounts', (role) => {
    expect(canManageUserTarget(editor, 'users.edit', { role })).toBe(false)
    expect(canManageUserTarget(editor, 'users.delete', { role })).toBe(false)
  })

  it('ADMIN manages staff; missing base permission denies', () => {
    expect(canManageUserTarget(admin, 'users.edit', { role: 'moderator' })).toBe(true)
    expect(canManageUserTarget(moderator({ can_edit_users: true }), 'users.delete', { role: 'client' })).toBe(false)
  })

  it('isStaffRole', () => {
    expect(['admin', 'MODERATOR'].map(isStaffRole)).toEqual([true, true])
    expect(['master', 'indie', 'client', '', null].map(isStaffRole)).toEqual([false, false, false, false, false])
  })
})

describe('fetchAdminAccess', () => {
  it('sends the bearer token and normalizes a 200', async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { role: 'moderator', permissions: { can_view_blog: true } }))
    const result = await fetchAdminAccess(fetcher, 'token-1')
    expect(fetcher).toHaveBeenCalledWith('/api/admin/access', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      cache: 'no-store',
    }))
    expect(result.status).toBe(ADMIN_ACCESS_STATUS.READY)
    expect(result.access.permissions.can_view_blog).toBe(true)
  })

  it.each([
    [401, ADMIN_ACCESS_STATUS.UNAUTHORIZED],
    [403, ADMIN_ACCESS_STATUS.FORBIDDEN],
    [500, ADMIN_ACCESS_STATUS.ERROR],
  ])('HTTP %i → %s without grants', async (code, status) => {
    const result = await fetchAdminAccess(async () => jsonResponse(code, { role: 'admin' }), 't')
    expect(result).toEqual({ status, access: null })
  })

  it('no token, network failure and invalid payload never grant', async () => {
    expect((await fetchAdminAccess(vi.fn(), null)).status).toBe(ADMIN_ACCESS_STATUS.UNAUTHORIZED)
    expect((await fetchAdminAccess(async () => { throw new TypeError('offline') }, 't')).status)
      .toBe(ADMIN_ACCESS_STATUS.ERROR)
    expect((await fetchAdminAccess(async () => jsonResponse(200, { role: 'client' }), 't')).status)
      .toBe(ADMIN_ACCESS_STATUS.ERROR)
    const broken = { ok: true, status: 200, json: async () => { throw new SyntaxError('bad') } }
    expect((await fetchAdminAccess(async () => broken, 't')).status).toBe(ADMIN_ACCESS_STATUS.ERROR)
  })
})

describe('createAdminAccessStore', () => {
  function deferredFetcher() {
    const pending = []
    const fetcher = vi.fn((url, init) => new Promise((resolve, reject) => {
      pending.push({ resolve, init })
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    }))
    return { fetcher, pending }
  }
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('a late response for the previous identity never lands', async () => {
    let token = 'moderator-token'
    const { fetcher, pending } = deferredFetcher()
    const store = createAdminAccessStore({ fetcher, getToken: () => token })

    store.load('7:moderator-token')
    token = 'admin-token'
    store.load('1:admin-token')
    expect(store.getSnapshot()).toMatchObject({ status: ADMIN_ACCESS_STATUS.LOADING, access: null, identity: '1:admin-token' })

    pending[0].resolve(jsonResponse(200, { role: 'moderator', permissions: { can_view_users: true } }))
    await tick()
    expect(store.getSnapshot().status).toBe(ADMIN_ACCESS_STATUS.LOADING)

    pending[1].resolve(jsonResponse(200, { role: 'admin', permissions: {} }))
    await tick()
    expect(store.getSnapshot()).toMatchObject({ status: ADMIN_ACCESS_STATUS.READY, identity: '1:admin-token' })
    expect(store.getSnapshot().access.role).toBe('admin')
  })

  it('switching identity drops previous grants before the new request resolves', async () => {
    const { fetcher, pending } = deferredFetcher()
    let token = 'a'
    const store = createAdminAccessStore({ fetcher, getToken: () => token })
    store.load('1:a')
    pending[0].resolve(jsonResponse(200, { role: 'admin', permissions: {} }))
    await tick()
    expect(store.getSnapshot().access.role).toBe('admin')

    token = 'b'
    store.load('2:b')
    expect(store.getSnapshot()).toMatchObject({ status: ADMIN_ACCESS_STATUS.LOADING, access: null })
  })

  it('forced refresh keeps the current snapshot until revocation arrives', async () => {
    const { fetcher, pending } = deferredFetcher()
    const store = createAdminAccessStore({ fetcher, getToken: () => 't' })
    store.load('5:t')
    pending[0].resolve(jsonResponse(200, { role: 'moderator', permissions: { can_view_users: true } }))
    await tick()

    store.load('5:t')
    expect(fetcher).toHaveBeenCalledTimes(1)

    store.load('5:t', { force: true })
    expect(store.getSnapshot().status).toBe(ADMIN_ACCESS_STATUS.READY)
    pending[1].resolve(jsonResponse(200, { role: 'moderator', permissions: {} }))
    await tick()
    expect(sectionKeys(store.getSnapshot().access)).toEqual([])
  })

  it('a token swapped during the request discards the response', async () => {
    const { fetcher, pending } = deferredFetcher()
    let token = 'old'
    const store = createAdminAccessStore({ fetcher, getToken: () => token })
    store.load('3:old')
    token = 'new'
    pending[0].resolve(jsonResponse(200, { role: 'admin', permissions: {} }))
    await tick()
    expect(store.getSnapshot()).toEqual({ status: ADMIN_ACCESS_STATUS.LOADING, access: null, identity: null })

    store.load('3:new')
    expect(fetcher).toHaveBeenCalledTimes(2)
    pending[1].resolve(jsonResponse(200, { role: 'moderator', permissions: { can_view_blog: true } }))
    await tick()
    expect(store.getSnapshot()).toMatchObject({ status: ADMIN_ACCESS_STATUS.READY, identity: '3:new' })
  })

  it('a transient failure of a background refresh keeps the open page', async () => {
    const { fetcher, pending } = deferredFetcher()
    const store = createAdminAccessStore({ fetcher, getToken: () => 't' })
    store.load('5:t')
    pending[0].resolve(jsonResponse(200, { role: 'moderator', permissions: { can_view_users: true } }))
    await tick()
    const before = store.getSnapshot()

    store.load('5:t', { force: true })
    pending[1].resolve(jsonResponse(502, {}))
    await tick()
    expect(store.getSnapshot()).toBe(before)
  })

  it.each([
    [401, ADMIN_ACCESS_STATUS.UNAUTHORIZED],
    [403, ADMIN_ACCESS_STATUS.FORBIDDEN],
  ])('a background refresh still applies an explicit %i', async (code, status) => {
    const { fetcher, pending } = deferredFetcher()
    const store = createAdminAccessStore({ fetcher, getToken: () => 't' })
    store.load('5:t')
    pending[0].resolve(jsonResponse(200, { role: 'admin', permissions: {} }))
    await tick()
    store.load('5:t', { force: true })
    pending[1].resolve(jsonResponse(code, {}))
    await tick()
    expect(store.getSnapshot()).toEqual({ status, access: null, identity: '5:t' })
  })

  it('an initial load error is shown, not hidden', async () => {
    const { fetcher, pending } = deferredFetcher()
    const store = createAdminAccessStore({ fetcher, getToken: () => 't' })
    store.load('5:t')
    pending[0].resolve(jsonResponse(500, {}))
    await tick()
    expect(store.getSnapshot().status).toBe(ADMIN_ACCESS_STATUS.ERROR)
  })

  it('reset clears grants and ignores in-flight responses', async () => {
    const { fetcher, pending } = deferredFetcher()
    const store = createAdminAccessStore({ fetcher, getToken: () => 't' })
    store.load('1:t')
    store.reset()
    pending[0].resolve(jsonResponse(200, { role: 'admin', permissions: {} }))
    await tick()
    expect(store.getSnapshot()).toEqual({ status: ADMIN_ACCESS_STATUS.LOADING, access: null, identity: null })
  })
})

describe('masterWorkspaceDecision', () => {
  const staff = (role, extra = {}) => ({ id: 1, role, ...extra })

  it.each(['master', 'indie', 'client', 'salon'])('%s keeps /master without a probe', (role) => {
    expect(masterWorkspaceDecision({ user: staff(role), isIosAppWebSession: false, probe: 'pending' })).toBe('master')
  })

  it.each(['admin', 'moderator'])('%s without a master profile goes to /admin', (role) => {
    expect(masterWorkspaceDecision({ user: staff(role), isIosAppWebSession: false, probe: 'pending' })).toBe('pending')
    expect(masterWorkspaceDecision({ user: staff(role), isIosAppWebSession: false, probe: 'no-profile' })).toBe('admin')
  })

  it('staff with an own master profile or an unknown probe keeps the master cabinet', () => {
    expect(masterWorkspaceDecision({ user: staff('moderator'), isIosAppWebSession: false, probe: 'has-profile' })).toBe('master')
    expect(masterWorkspaceDecision({ user: staff('moderator'), isIosAppWebSession: false, probe: 'unknown' })).toBe('master')
  })

  it('iOS app, demo and anonymous sessions are untouched', () => {
    expect(masterWorkspaceDecision({ user: staff('admin'), isIosAppWebSession: true, probe: 'no-profile' })).toBe('master')
    expect(masterWorkspaceDecision({ user: staff('admin', { is_demo_session: true }), isIosAppWebSession: false, probe: 'no-profile' })).toBe('master')
    expect(masterWorkspaceDecision({ user: null, isIosAppWebSession: false, probe: 'no-profile' })).toBe('master')
  })
})
