import { describe, expect, it, vi } from 'vitest'
import { AUTH_STATUS as S, authPermissions, createAuthSession, IOS_CONTEXT_TTL, readIosContext } from './authSession'

const memory = () => {
  const values = new Map()
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) }
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const person = (origin = null) => ({ role: 'master', web_session_origin: origin })
const response = (origin = null) => ({ ok: true, json: async () => person(origin) })
const setup = (options = {}) => {
  const storage = memory(), tabStorage = memory()
  if (options.token !== false) storage.setItem('access_token', 'test-session-one')
  const fetcher = options.fetcher || vi.fn().mockResolvedValue(response())
  const session = createAuthSession({ storage, tabStorage, fetcher, ...options })
  return { storage, tabStorage, fetcher, session, state: () => session.getSnapshot(), permissions: () => authPermissions(session.getSnapshot()) }
}

describe('auth session identity and fail-closed commerce', () => {
  it.each([null, 'ios_app'])('OAuth %s completion uses the authoritative exchange profile atomically', async origin => {
    const x = setup({ path: '/auth/oauth/callback' })
    const attempt = x.session.beginOAuth()
    await x.session.check()
    expect(x.fetcher).not.toHaveBeenCalled()
    expect(x.permissions().commerceAllowed).toBe(false)
    expect(attempt.complete({ access_token: 'oauth-new', user: person(origin) })).toBe(true)
    expect(x.state().user.web_session_origin).toBe(origin)
    expect(x.permissions().commerceAllowed).toBe(origin !== 'ios_app')
  })

  it('OAuth error cannot bootstrap an old ordinary token or fall back to commerce', async () => {
    const x = setup({ path: '/auth/oauth/callback' })
    const attempt = x.session.beginOAuth()
    attempt.fail()
    await x.session.check()
    expect(x.state().status).toBe(S.ERROR)
    expect(x.permissions().commerceAllowed).toBe(false)
    expect(x.fetcher).not.toHaveBeenCalled()
  })

  it('OAuth requires explicit server origin, never an incomplete fallback user', () => {
    const x = setup({ path: '/auth/oauth/callback' })
    expect(() => x.session.beginOAuth().complete({ access_token: 'oauth-new', user: { role: 'master' } })).toThrow()
    expect(x.permissions().commerceAllowed).toBe(false)
    expect(x.storage.getItem('access_token')).toBe('test-session-one')
  })

  it('a subsequent explicit successful login ends the failed OAuth resolution lock', async () => {
    const x = setup({ path: '/auth/oauth/callback' })
    x.session.beginOAuth().fail()
    x.storage.setItem('access_token', 'explicit-new-login')
    x.session.login(person('ios_app'))
    x.fetcher.mockResolvedValue(response('ios_app'))
    await x.session.check()
    expect(x.fetcher).toHaveBeenCalledTimes(1)
    expect(x.state().status).toBe(S.IOS_APP)
    expect(x.permissions().commerceAllowed).toBe(false)
  })

  it('late OAuth exchange cannot replace a newer multi-tab ios_app token even before storage event', () => {
    const x = setup()
    const attempt = x.session.beginOAuth()
    x.storage.setItem('access_token', 'newer-ios')
    expect(attempt.complete({ access_token: 'stale-ordinary', user: person() })).toBe(false)
    expect(x.storage.getItem('access_token')).toBe('newer-ios')
    expect(x.permissions().commerceAllowed).toBe(false)
  })

  it('OAuth invalidates delayed bootstrap and refuses an ios_app downgrade', async () => {
    const pending = deferred()
    const x = setup({ fetcher: vi.fn(() => pending.promise) })
    const check = x.session.check()
    const attempt = x.session.beginOAuth()
    attempt.complete({ access_token: 'oauth-ios', user: person('ios_app') })
    pending.resolve(response()); await check
    expect(x.state().status).toBe(S.IOS_APP)
    expect(() => x.session.beginOAuth().complete({ access_token: 'ordinary', user: person() })).toThrow()
    expect(x.permissions().commerceAllowed).toBe(false)
  })
  it('ignores late login hydration for an obsolete token', () => {
    const x = setup()
    x.storage.setItem('access_token', 'test-ios-session')
    x.session.login(person('ios_app'))
    expect(x.session.login(person(), 'test-session-one')).toBe(false)
    expect(x.state().status).toBe(S.IOS_APP)
  })

  it('login without a resolved profile cannot enable commerce', () => {
    const x = setup()
    expect(x.session.login({})).toBe(false)
    expect(x.state().status).toBe(S.ERROR)
    expect(x.permissions().commerceAllowed).toBe(false)
  })

  it('newly issued login token denies commerce until its profile is resolved', () => {
    const x = setup()
    x.session.login(person())
    x.storage.setItem('access_token', 'test-new-login')
    x.session.prepareLogin()
    expect(x.state().status).toBe(S.LOADING)
    expect(x.permissions().commerceAllowed).toBe(false)
    x.session.login(person(), 'test-new-login')
    expect(x.permissions().commerceAllowed).toBe(true)
  })
  it.each([[null, 'ios_app'], ['ios_app', null]])('ignores stale %s bootstrap after %s login even if abort is ignored', async (oldOrigin, newOrigin) => {
    const pending = deferred()
    const x = setup({ fetcher: vi.fn(() => pending.promise) })
    const check = x.session.check()
    x.storage.setItem('access_token', 'test-session-two')
    x.session.login(person(newOrigin))
    pending.resolve(response(oldOrigin))
    await check
    expect(x.state().user.web_session_origin).toBe(newOrigin)
    expect(x.permissions().commerceAllowed).toBe(newOrigin !== 'ios_app')
    expect(x.fetcher.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('checks identity after asynchronous JSON parsing too', async () => {
    const json = deferred()
    const x = setup({ fetcher: vi.fn().mockResolvedValue({ ok: true, json: () => json.promise }) })
    const check = x.session.check()
    await Promise.resolve()
    x.storage.setItem('access_token', 'test-session-two')
    x.session.login(person('ios_app'))
    json.resolve(person())
    await check
    expect(x.state().status).toBe(S.IOS_APP)
  })

  it.each(['network', 401, 403, 500])('existing token + %s failure is not anonymous', async (kind) => {
    const fetcher = kind === 'network' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue({ ok: false, status: kind })
    const x = setup({ fetcher })
    await x.session.check()
    expect(x.state().status).toBe(S.ERROR)
    expect(x.permissions().commerceAllowed).toBe(false)
    expect(x.storage.getItem('access_token')).toBe('test-session-one')
  })

  it('anonymous direct pricing remains allowed and makes no bootstrap request', async () => {
    const x = setup({ token: false })
    expect(x.permissions().commerceAllowed).toBe(false)
    await x.session.check()
    expect(x.state().status).toBe(S.ANONYMOUS)
    expect(x.permissions().commerceAllowed).toBe(true)
    expect(x.fetcher).not.toHaveBeenCalled()
  })

  it.each([null, 'ios_app'])('resolved %s origin gets the correct permission', async (origin) => {
    const x = setup({ fetcher: vi.fn().mockResolvedValue(response(origin)) })
    await x.session.check()
    expect(x.permissions().commerceAllowed).toBe(origin !== 'ios_app')
  })

  it('unknown origin fails closed', async () => {
    const x = setup({ fetcher: vi.fn().mockResolvedValue(response('unknown-origin')) })
    await x.session.check()
    expect(x.state().status).toBe(S.ERROR)
  })

  it.each([[null, 'ios_app'], ['ios_app', null]])('multi-tab %s to %s re-resolves and denies during the transition', async (from, to) => {
    const pending = deferred()
    const x = setup({ fetcher: vi.fn(() => pending.promise) })
    x.session.login(person(from))
    x.storage.setItem('access_token', 'test-other-tab')
    const sync = x.session.sync()
    expect(x.state().status).toBe(S.LOADING)
    expect(x.permissions().commerceAllowed).toBe(false)
    pending.resolve(response(to)); await sync
    expect(x.state().user.web_session_origin).toBe(to)
    expect(x.permissions().commerceAllowed).toBe(to !== 'ios_app')
  })

  it('rapid replacements cannot resurrect an intermediate session', async () => {
    const first = deferred(), last = deferred()
    const x = setup({ fetcher: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise) })
    const a = x.session.check()
    x.storage.setItem('access_token', 'test-last')
    const b = x.session.sync()
    last.resolve(response('ios_app')); await b
    first.resolve(response()); await a
    expect(x.state().status).toBe(S.IOS_APP)
  })

  it('logout invalidates outstanding response and clears identity', async () => {
    const pending = deferred()
    const x = setup({ fetcher: vi.fn(() => pending.promise) })
    const request = x.session.check()
    x.storage.removeItem('access_token')
    await x.session.sync()
    pending.resolve(response('ios_app')); await request
    expect(x.state().status).toBe(S.ANONYMOUS)
    expect(x.state().user).toBeNull()
  })

  it('iOS logout does not expose commerce on public links in that tab', async () => {
    const x = setup()
    x.session.login(person('ios_app'))
    x.storage.removeItem('access_token')
    await x.session.sync()
    expect(x.permissions().commerceAllowed).toBe(false)
  })

  it.each(['expired', 'invalid', 'network', 'missing-code'])('failed %s handoff never falls back to existing ordinary session', async () => {
    const x = setup()
    x.session.login(person())
    const attempt = x.session.beginHandoff()
    expect(x.permissions().commerceAllowed).toBe(false)
    attempt.fail()
    expect(x.state().status).toBe(S.ERROR)
    expect(x.state().user).toBeNull()
    await x.session.check()
    expect(x.permissions().commerceAllowed).toBe(false)
    expect(x.fetcher).not.toHaveBeenCalled()
  })

  it('successful exchange atomically replaces credentials and clears pending UX marker', () => {
    const x = setup()
    const attempt = x.session.beginHandoff()
    expect(attempt.complete({ access_token: 'test-handoff', user: person(), web_session_origin: 'ios_app' })).toBe(true)
    expect(x.state().status).toBe(S.IOS_APP)
    expect(x.state().marker).toBeNull()
    expect(x.permissions().commerceAllowed).toBe(false)
  })

  it('stale handoff cannot replace a newer login', () => {
    const x = setup()
    const attempt = x.session.beginHandoff()
    x.storage.setItem('access_token', 'test-new-login')
    x.session.login(person())
    expect(attempt.complete({ access_token: 'test-old-handoff', user: person(), web_session_origin: 'ios_app' })).toBe(false)
    expect(x.storage.getItem('access_token')).toBe('test-new-login')
    expect(x.permissions().commerceAllowed).toBe(false) // failed flow remains isolated
  })

  it.each(['/privacy-policy', '/user-agreement', '/personal-data-consent', '/account-deletion'])('public legal context %s is UX-only, not an authenticated session', async (path) => {
    const x = setup({ token: false, path, search: '?context=ios_app' })
    await x.session.check()
    expect(x.state().status).toBe(S.ANONYMOUS)
    expect(x.permissions().isIosAppWebSession).toBe(false)
    expect(x.permissions().commerceAllowed).toBe(false)
  })

  it('context marker is bounded, carries no credential, and expires on next entry', () => {
    const x = setup({ path: '/auth/mobile-handoff', now: () => 100 })
    const value = x.tabStorage.getItem('dedato_ios_context')
    expect(JSON.parse(value)).toEqual({ kind: 'ios_app_pending', expiresAt: 100 + IOS_CONTEXT_TTL })
    expect(value).not.toContain('test-session')
    expect(readIosContext(x.tabStorage, 101 + IOS_CONTEXT_TTL)).toBeNull()
  })

  it('token identity check protects even before a storage event is delivered', async () => {
    const pending = deferred()
    const x = setup({ fetcher: vi.fn(() => pending.promise) })
    const check = x.session.check()
    x.storage.setItem('access_token', 'test-other-tab')
    pending.resolve(response()); await check
    expect(x.state().status).toBe(S.LOADING)
    expect(x.permissions().commerceAllowed).toBe(false)
  })
})
