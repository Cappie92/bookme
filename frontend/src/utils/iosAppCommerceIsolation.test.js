import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { safeHandoffRedirect } from './webHandoffRedirect'

const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8')

describe('ios_app operational web isolation', () => {
  it.each([
    '/master?tab=schedule',
    '/master?tab=services',
    '/master?tab=settings&section=public-page',
  ])('accepts server canonical destination %s', (redirectTo) => {
    expect(safeHandoffRedirect({ web_session_origin: 'ios_app', redirect_to: redirectTo })).toBe(redirectTo)
  })

  it.each(['/pricing', '/master?tab=tariff', 'https://evil.example']) (
    'fails closed for ios_app redirect %s',
    (redirectTo) => {
      expect(safeHandoffRedirect({ web_session_origin: 'ios_app', redirect_to: redirectTo })).toBe('/master')
    },
  )

  it('keeps ordinary web redirect behavior', () => {
    expect(safeHandoffRedirect({ redirect_to: '/pricing' })).toBe('/pricing')
  })

  it('guards commerce routes and hides commerce navigation for ios_app', () => {
    const app = source('../App.jsx')
    const header = source('../components/Header.jsx')
    const footer = source('../components/Footer.jsx')
    const dashboard = source('../pages/MasterDashboard.jsx')
    expect(app.match(/<IosCommerceRouteGuard>/g)?.length).toBeGreaterThanOrEqual(5)
    expect(header).toContain("isIosAppWebSession ? 'hidden' : 'flex'")
    expect(footer).toContain('!isIosAppWebSession ? <Link')
    expect(dashboard).toContain('enabled: !isIosAppWebSession')
    expect(dashboard).toContain("['dashboard', 'schedule', 'services', 'settings']")
  })

  it('uses the narrow trusted-origin endpoint for iOS domain changes', () => {
    const settings = source('../components/MasterSettings.jsx')
    expect(settings).toContain("apiFetch('/api/master/ios-web/domain'")
    expect(settings).toContain('if (isIosAppWebSession)')
    expect(settings).toContain('!isIosAppWebSession && !featuresLoading')
    expect(settings).toContain('!isIosAppWebSession && showAppleDeleteWarning')
    expect(settings).toContain('setShowDeleteAccountModal(true)')
  })
})
