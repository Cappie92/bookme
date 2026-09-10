import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { storeDemoSession } from './demoSession'
import { createAuthSession, AUTH_STATUS } from './authSession'

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const storage = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key) }
}

describe('short readonly demo session', () => {
  it('replaces prior credentials without persisting an undefined/stale refresh', async () => {
    const local = storage({ access_token: 'old-test', refresh_token: 'old-refresh-test' })
    const tab = storage()
    storeDemoSession({ access_token: 'demo-test', token_type: 'bearer', expires_in: 900 }, local, tab)
    expect(local.getItem('refresh_token')).toBeNull()
    expect(local.getItem('demo_mode')).toBe('1')
    const session = createAuthSession({ storage: local, tabStorage: tab,
      fetcher: async () => ({ ok: true, json: async () => ({ role: 'master', is_demo_session: true }) }) })
    await session.check()
    expect(session.getSnapshot().status).toBe(AUTH_STATUS.ORDINARY)
    expect(local.getItem('demo_mode')).toBe('1')
    session.logout()
    expect(session.getSnapshot().status).toBe(AUTH_STATUS.ANONYMOUS)
    session.dispose()
  })

  it('does not treat a phone or previous demo UI flag as server demo identity', async () => {
    const local = storage({ access_token: 'ordinary-test', demo_mode: '1' })
    const session = createAuthSession({ storage: local, tabStorage: storage(),
      fetcher: async () => ({ ok: true, json: async () => ({ role: 'master', phone: '+79990009999' }) }) })
    await session.check()
    expect(local.getItem('demo_mode')).toBeNull()
    session.dispose()
  })

  it('rejects unavailable/malformed responses before replacing the session', () => {
    const local = storage({ access_token: 'existing-test' })
    expect(() => storeDemoSession({}, local, storage())).toThrow()
    expect(local.getItem('access_token')).toBe('existing-test')
  })

  it('retains public CTA, explicit unavailable error and restricted-ios entry guard', () => {
    const entry = source('../pages/DemoMasterEntry.jsx')
    expect(source('../pages/Home.jsx')).toContain('/demo/master')
    expect(entry).toContain("fetch('/api/auth/demo-master-access'")
    expect(entry).toContain('if (isIosRestrictedContext) throw')
    expect(entry).toContain('Демо временно недоступно')
    expect(entry).toContain("navigate('/master?tab=dashboard&demo=1'")
    expect(entry).not.toContain("setItem('refresh_token'")
    expect(source('../components/AuthSafetyBoundary.jsx')).toContain(
      "pathname === '/demo/master' && !loading && !isIosRestrictedContext && !handoffPending")
  })

  it('does not mount commerce/referral/purchase UI in demo or ios_app', () => {
    const dashboard = source('../pages/MasterDashboard.jsx')
    expect(dashboard).toContain('!isIosAppWebSession &&\n            (isDemoMode ?')
    expect(dashboard).toContain('!isIosAppWebSession && !isDemoMode && showSubscriptionModal')
    expect(dashboard).toContain('Покупка и изменение подписки недоступны')
  })
})
