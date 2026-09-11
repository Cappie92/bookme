import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  MASTER_NAV_SIDEBAR_LEAD,
  MASTER_NAV_SIDEBAR_TAIL,
  getMasterNavCatalogRows,
} from '../config/masterNavConfig'
import {
  IOS_APP_WEB_EDITOR_TABS,
  filterMasterNavRowsForWebSession,
  resolveMasterTabForWebSession,
} from './iosAppWebEditorPolicy'
import { safeHandoffRedirect } from './webHandoffRedirect'

const source = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const accessVariants = {
  Free: {
    hasExtendedStats: false,
    hasFinanceAccess: false,
    hasLoyaltyAccess: false,
    hasClientRestrictions: false,
    hasClientsAccess: false,
  },
  Paid: {
    hasExtendedStats: true,
    hasFinanceAccess: true,
    hasLoyaltyAccess: true,
    hasClientRestrictions: true,
    hasClientsAccess: true,
  },
  AlwaysFree: {
    hasExtendedStats: true,
    hasFinanceAccess: true,
    hasLoyaltyAccess: true,
    hasClientRestrictions: true,
    hasClientsAccess: true,
  },
}

const menuTabs = (accessFlags, isIosAppWebSession) => [
  MASTER_NAV_SIDEBAR_LEAD.tab,
  ...filterMasterNavRowsForWebSession(
    getMasterNavCatalogRows(accessFlags, true),
    isIosAppWebSession,
  ).map((row) => row.tab),
  MASTER_NAV_SIDEBAR_TAIL.tab,
]

describe('ios_app operational web editor isolation', () => {
  it.each([
    '/master?tab=schedule',
    '/master?tab=services',
    '/master?tab=settings&section=public-page',
  ])('accepts server canonical handoff destination %s', (redirectTo) => {
    expect(safeHandoffRedirect({ web_session_origin: 'ios_app', redirect_to: redirectTo })).toBe(redirectTo)
  })

  it.each(['/pricing', '/master?tab=tariff', 'https://evil.example'])(
    'fails closed for ios_app handoff redirect %s',
    (redirectTo) => {
      expect(safeHandoffRedirect({ web_session_origin: 'ios_app', redirect_to: redirectTo })).toBe('/master')
    },
  )

  it('keeps the complete ordinary web master menu unchanged', () => {
    expect(menuTabs(accessVariants.Paid, false)).toEqual([
      'dashboard',
      'schedule',
      'services',
      'stats',
      'salon-work',
      'accounting',
      'loyalty',
      'clients',
      'restrictions',
      'tariff',
      'settings',
    ])
  })

  it.each(Object.entries(accessVariants))(
    'uses the same four-tab ios_app editor shell for %s entitlement',
    (_name, accessFlags) => {
      expect(menuTabs(accessFlags, true)).toEqual(IOS_APP_WEB_EDITOR_TABS)
    },
  )

  it.each(['dashboard', 'schedule', 'services', 'settings'])(
    'allows direct editor tab %s for ios_app',
    (tab) => {
      expect(resolveMasterTabForWebSession(tab, true)).toBe(tab)
    },
  )

  it.each([
    'clients',
    'accounting',
    'finance',
    'loyalty',
    'stats',
    'restrictions',
    'salon-work',
    'invitations',
    'tariff',
    'subscription',
  ])('normalizes blocked ios_app tab %s to safe home', (tab) => {
    expect(resolveMasterTabForWebSession(tab, true)).toBe('dashboard')
    expect(resolveMasterTabForWebSession(tab, false)).toBe(tab)
  })

  it('keeps ordinary web handoff redirect behavior', () => {
    expect(safeHandoffRedirect({ redirect_to: '/pricing' })).toBe('/pricing')
  })

  it('uses the server redirect in MobileHandoff with no legacy Pricing navigation', () => {
    const handoff = source('../pages/MobileHandoff.jsx')
    expect(handoff).toContain('navigate(safeHandoffRedirect(data), { replace: true })')
    expect(handoff).not.toContain("navigate('/pricing'")
    expect(handoff).not.toContain('navigate("/pricing"')
  })

  it('derives ios_app only from the server-provided session claim', () => {
    const auth = source('../contexts/AuthContext.jsx')
    const policy = source('./iosAppWebEditorPolicy.js')
    expect(auth).toContain('authPermissions(authState)')
    expect(source('./authSession.js')).toContain("user.web_session_origin === 'ios_app'")
    expect(policy).not.toContain('location.search')
    expect(policy).not.toContain('localStorage')
  })

  it('guards every commerce page for ios_app while ordinary routes remain defined', () => {
    const app = source('../App.jsx')
    for (const path of [
      '/pricing',
      '/payment/success',
      '/payment/failed',
      '/master/tariff',
      '/master/subscription/plans',
    ]) {
      expect(app).toContain(`<Route path="${path}" element={<IosCommerceRouteGuard>`)
    }
  })

  it('renders an intentional four-item mobile editor navigation with no Menu hub', () => {
    const bottomNav = source('../components/master/mobile/MasterMobileBottomNav.jsx')
    const dashboard = source('../pages/MasterDashboard.jsx')
    expect(bottomNav).toContain('data-testid="ios-app-web-editor-nav"')
    expect(bottomNav).toContain("{ tab: 'dashboard', label: 'Дашборд'")
    expect(bottomNav).toContain("{ tab: 'schedule', label: 'Расписание'")
    expect(bottomNav).toContain("{ tab: 'services', label: 'Услуги'")
    expect(bottomNav).toContain("{ tab: 'settings', label: 'Настройки'")
    expect(dashboard).toContain('{!isIosAppWebSession && (')
    expect(dashboard).toContain('<MasterMobileMenu')
  })

  it('keeps ios_app hidden-module and commerce API fetches disabled', () => {
    const dashboard = source('../pages/MasterDashboard.jsx')
    const dashboardStats = source('../components/MasterDashboardStats.jsx')
    const mobileMenu = source('../components/master/mobile/MasterMobileMenu.jsx')
    expect(dashboard).toContain('useMasterSubscription({ enabled: commerceAllowed })')
    expect(dashboard).toContain('if (isIosAppWebSession) return')
    expect(dashboard).toContain('if (!isIosAppWebSession) {')
    expect(dashboardStats).toContain('client_surface=ios_fixed')
    expect(dashboardStats).toContain('if (!isIosAppWebSession) loadBookingsLimit()')
    expect(mobileMenu).toContain('if (!isOpen || isIosAppWebSession) return')
  })

  it('keeps commerce navigation hidden in the ios_app shell', () => {
    const header = source('../components/Header.jsx')
    const footer = source('../components/Footer.jsx')
    const dashboard = source('../pages/MasterDashboard.jsx')
    expect(header).toContain("isIosAppWebSession ? 'hidden' : 'flex'")
    expect(header).toContain('{commerceAllowed && (')
    expect(footer).toContain('commerceAllowed ? <Link')
    expect(dashboard).toContain('!isIosAppWebSession && !isDemoMode && showSubscriptionModal')
    expect(dashboard).toContain('!isIosAppWebSession &&')
  })

  it('preserves the settings public-page editor destination', () => {
    const dashboard = source('../pages/MasterDashboard.jsx')
    const settings = source('../components/MasterSettings.jsx')
    expect(dashboard).toContain("requestedSettingsSection === 'public-page'")
    expect(dashboard).toContain('initialPublicPageEditor=')
    expect(settings).not.toContain("apiFetch('/api/master/ios-web/domain'")
    expect(settings).toContain('!isIosAppWebSession && (isDemoMode || canCustomizeDomain)')
  })

  it('does not reuse native iOS capability policy in web code', () => {
    const policy = source('./iosAppWebEditorPolicy.js')
    const dashboard = source('../pages/MasterDashboard.jsx')
    expect(policy).not.toContain('iosMasterCapabilities')
    expect(dashboard).not.toContain('IOS_MASTER_CAPABILITIES')
  })
})
