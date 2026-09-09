import { test, expect, type Page } from '@playwright/test'

const forbidden = /pricing-catalog|subscription-plans|subscription|balance|payment\/init|loyalty|invitations/
const commerceLinks = 'a[href="/pricing"], a[href="/master/tariff"], a[href="/master/subscription/plans"]'
const user = (origin: string | null, plan = 'Free') => ({
  id: 1, role: 'master', full_name: 'Fixture Master', web_session_origin: origin,
  phone: '+79990000000', is_phone_verified: true,
  is_always_free: plan === 'AlwaysFree', subscription_plan: plan,
})

async function fixture(page: Page, { origin = 'ios_app' as string | null, plan = 'Free', token = true, authError = false, exchangeError = false } = {}) {
  const requests: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(({ token }) => {
    if (token && !localStorage.getItem('access_token')) localStorage.setItem('access_token', 'test-session-one')
  }, { token })
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === 'mc.yandex.ru' && url.pathname.endsWith('tag.js')) return route.fulfill({ contentType: 'application/javascript', body: '/* Local analytics stub: no external network. */' })
    if (url.origin !== 'http://127.0.0.1:5197') return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    requests.push(url.pathname + url.search)
    if (url.pathname === '/api/auth/users/me') {
      if (authError) return route.abort()
      const currentOrigin = route.request().headers().authorization?.includes('test-ios-session') ? 'ios_app' : origin
      return route.fulfill({ json: user(currentOrigin, plan) })
    }
    if (url.pathname.endsWith('/web-handoff/exchange')) {
      return route.fulfill(exchangeError ? { status: 410, json: { detail: 'Expired' } } :
        { json: { access_token: 'test-ios-session', user: user('ios_app', plan), web_session_origin: 'ios_app', redirect_to: '/master?tab=schedule' } })
    }
    if (url.pathname === '/api/master/settings') return route.fulfill({ json: {
      user: user(origin, plan), master: { id: 1, domain: 'fixture', city: 'Москва', timezone: 'Europe/Moscow', bio: 'Fixture', address: 'Fixture', auto_confirm_bookings: false },
    } })
    if (url.pathname.includes('past-appointments')) return route.fulfill({ json: {
      appointments: [{ id: 1, date: '2026-01-01', time: '10:00', status: 'completed', client_name: 'Fixture Client', service_name: 'Fixture Service' }], pages: 1, total: 1,
    } })
    if (url.pathname.includes('schedule/weekly') || url.pathname.includes('schedule/monthly')) return route.fulfill({ json: { slots: [] } })
    if (url.pathname.includes('bookings/future')) return route.fulfill({ json: { bookings: [], total: 0 } })
    if (url.pathname.includes('dashboard/stats')) return route.fulfill({ json: { weeks_data: [], bookings_count: 0 } })
    if (url.pathname.includes('pricing-catalog')) return route.fulfill({ json: { plans: [{ id: 1, name: 'Free', price: 0, duration: 1, service_functions: [] }], service_functions: [] } })
    if (/services|categories|conflicts|rules|detailed|favorites|cities/.test(url.pathname)) return route.fulfill({ json: [] })
    return route.fulfill({ json: {} })
  })
  return { requests, errors }
}

async function openProbe(page: Page) {
  await page.goto('/e2e/fixtures/iosHardeningHarness.html')
}

for (const width of [375, 430, 768, 820, 1024, 1180]) {
  for (const plan of ['Free', 'Paid', 'AlwaysFree']) {
    test(`ios_app ${plan} at ${width}px: four-tab shell, past bookings read-only, no commerce APIs`, async ({ page }) => {
      const evidence = await fixture(page, { plan })
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/master?tab=schedule')
      const nav = width < 1024 ? page.getByTestId('ios-app-web-editor-nav') : page.getByRole('complementary', { name: 'Навигация кабинета' })
      await expect(nav).toBeVisible()
      for (const label of ['Дашборд', 'Расписание', 'Услуги', 'Настройки']) await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible()
      await expect(nav.getByRole('button')).toHaveCount(4)
      await page.getByRole('tab', { name: 'Прошедшие записи', exact: true }).click()
      await expect(page.getByText('Fixture Client')).toBeVisible()
      await expect(page.getByText('Изменить статус', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0)
      await expect(page.locator(commerceLinks)).toHaveCount(0)
      expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
      expect(evidence.requests.filter((url) => url.includes('/accounting/'))).toEqual([])
      expect(evidence.errors).toEqual([])
      if (plan === 'Free' && [375, 820].includes(width)) {
        await page.screenshot({ path: test.info().outputPath('ios-editor.png'), fullPage: true })
      }
    })
  }
}

for (const path of ['/about', '/privacy-policy', '/user-agreement', '/personal-data-consent', '/account-deletion']) {
  test(`trusted iOS public/legal ${path} has no commerce links`, async ({ page }) => {
    const evidence = await fixture(page)
    await page.goto(path)
    await expect(page.locator('main, article').first()).toBeVisible()
    await expect(page.locator(commerceLinks)).toHaveCount(0)
    expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
  })
  test(`ordinary public ${path} retains pricing link`, async ({ page }) => {
    await fixture(page, { token: false, origin: null })
    await page.goto(path)
    await expect(page.locator('a[href="/pricing"]').first()).toBeVisible()
  })
}

test('native legal flag protects existing ordinary browser session and survives public navigation', async ({ page }) => {
  await fixture(page, { origin: null })
  await page.goto('/privacy-policy?context=ios_app')
  await expect(page.locator('main, article').first()).toBeVisible()
  await expect(page.locator(commerceLinks)).toHaveCount(0)
  await page.goto('/about')
  await expect(page.locator(commerceLinks)).toHaveCount(0)
  await page.goto('/master')
  await expect(page.getByTestId('isolated-session-error')).toBeVisible()
})

for (const path of ['/pricing', '/master/tariff', '/master/subscription/plans', '/payment/success', '/payment/failed', '/master?tab=accounting', '/master?tab=loyalty', '/master?tab=clients', '/master?tab=stats', '/master?tab=restrictions', '/master?tab=salon-work', '/master?tab=invitations']) {
  test(`ios_app forbidden route ${path} never mounts commerce`, async ({ page }) => {
    const evidence = await fixture(page)
    await page.goto(path)
    await expect(page.getByRole('complementary', { name: 'Навигация кабинета' })).toBeVisible()
    await expect(page.locator(commerceLinks)).toHaveCount(0)
    expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
  })
}

test('expired handoff keeps old ordinary session isolated, including reload/direct cabinet', async ({ page }) => {
  const evidence = await fixture(page, { origin: null, exchangeError: true })
  await page.goto('/auth/mobile-handoff?code=test-one-time-code')
  await expect(page.getByTestId('isolated-session-error')).toBeVisible()
  await expect(page).not.toHaveURL(/code=/)
  await expect(page.getByText('Перейти в кабинет')).toHaveCount(0)
  await page.goto('/master')
  await expect(page.getByTestId('isolated-session-error')).toBeVisible()
  expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
})

test('successful handoff works under React StrictMode', async ({ page }) => {
  await fixture(page, { origin: null })
  await page.goto('/auth/mobile-handoff?code=test-one-time-code')
  await expect(page.getByRole('complementary', { name: 'Навигация кабинета' })).toBeVisible()
  await expect(page).toHaveURL(/tab=schedule/)
})

for (const authError of [false, true]) {
  test(`accidental pricing hook mount with iOS/error=${authError} never fetches catalog`, async ({ page }) => {
    const evidence = await fixture(page, { authError })
    await openProbe(page)
    await expect(page.getByTestId('state')).toHaveText(authError ? 'AUTH_ERROR' : 'AUTHENTICATED_IOS_APP')
    expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
    await expect(page.getByTestId('plans')).toHaveText('0')
  })
}

test('ordinary anonymous hook works; iOS transition aborts pending catalog and hides stale data', async ({ page }) => {
  await fixture(page, { token: false, origin: null })
  await openProbe(page)
  await expect(page.getByTestId('plans')).toHaveText('1')
  await page.getByRole('button', { name: 'iOS login' }).click()
  await expect(page.getByTestId('plans')).toHaveText('0')
  await expect(page.getByTestId('state')).toHaveText('AUTHENTICATED_IOS_APP')
})

for (const plan of ['Free', 'Paid', 'AlwaysFree']) {
  test(`${plan}: every approved editor tab keeps the same non-commerce API surface`, async ({ page }) => {
    const evidence = await fixture(page, { plan })
    for (const tab of ['dashboard', 'schedule', 'services', 'settings']) {
      await page.goto('/master?tab=' + tab)
      await expect(page.getByRole('complementary', { name: 'Навигация кабинета' })).toBeVisible()
      await expect(page.locator('main')).toBeVisible()
      await expect(page.locator(commerceLinks)).toHaveCount(0)
      await expect(page.getByText('Тариф заморожен', { exact: true })).toHaveCount(0)
    }
    expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
    expect(evidence.errors).toEqual([])
    await test.info().attach('operational-api-matrix', {
      body: JSON.stringify([...new Set(evidence.requests)].sort(), null, 2),
      contentType: 'application/json',
    })
  })
}

test('real storage events synchronize ordinary/iOS replacement and logout across tabs', async ({ page, context }) => {
  await fixture(page, { origin: null })
  await openProbe(page)
  await expect(page.getByTestId('state')).toHaveText('AUTHENTICATED_ORDINARY')
  const other = await context.newPage()
  await fixture(other, { token: false, origin: null })
  await other.goto('/about')
  await other.evaluate(() => localStorage.setItem('access_token', 'test-ios-session'))
  await expect(page.getByTestId('state')).toHaveText('AUTHENTICATED_IOS_APP')
  await expect(page.getByTestId('plans')).toHaveText('0')
  await other.evaluate(() => localStorage.setItem('access_token', 'test-new-ordinary'))
  await expect(page.getByTestId('state')).toHaveText('AUTHENTICATED_ORDINARY')
  await expect(page.getByTestId('plans')).toHaveText('1')
  await other.evaluate(() => localStorage.removeItem('access_token'))
  await expect(page.getByTestId('state')).toHaveText('ANONYMOUS_CONFIRMED')
})

test('catalog AbortController cancels a genuinely pending request on iOS transition', async ({ page }) => {
  await fixture(page, { token: false, origin: null })
  await page.addInitScript(() => {
    const original = window.fetch
    ;(window as any).__catalogSignals = []
    window.fetch = (input, init) => {
      if (String(input).includes('pricing-catalog')) (window as any).__catalogSignals.push(init?.signal)
      return original(input, init)
    }
  })
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/subscription-plans/pricing-catalog?*', async (route) => {
    await pending
    await route.fulfill({ json: { plans: [{ name: 'Free' }] } }).catch(() => {})
  })
  await openProbe(page)
  await expect.poll(() => page.evaluate(() => (window as any).__catalogSignals.length)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'iOS login' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__catalogSignals.every((signal: AbortSignal) => signal.aborted))).toBe(true)
  release()
  await expect(page.getByTestId('plans')).toHaveText('0')
})

test('late ordinary bootstrap cannot enable mounted catalog after newer iOS login', async ({ page }) => {
  const evidence = await fixture(page, { origin: null })
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/auth/users/me', async (route) => {
    await pending
    await route.fulfill({ json: user(null) }).catch(() => {})
  })
  await openProbe(page)
  await expect(page.getByTestId('state')).toHaveText('LOADING')
  await page.getByRole('button', { name: 'iOS login' }).click()
  release()
  await expect(page.getByTestId('state')).toHaveText('AUTHENTICATED_IOS_APP')
  await expect(page.getByTestId('plans')).toHaveText('0')
  expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
})

test('network-failed handoff never opens the existing ordinary cabinet', async ({ page }) => {
  const evidence = await fixture(page, { origin: null })
  await page.route('**/api/auth/web-handoff/exchange', (route) => route.abort())
  await page.goto('/auth/mobile-handoff?code=test-one-time-code')
  await expect(page.getByTestId('isolated-session-error')).toBeVisible()
  await expect(page.locator('a')).toHaveCount(0)
  await page.goto('/pricing')
  await expect(page.getByTestId('isolated-session-error')).toBeVisible()
  expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
})

test('existing token auth failure denies the actual direct Pricing route', async ({ page }) => {
  const evidence = await fixture(page, { authError: true })
  await page.goto('/pricing')
  await expect(page.getByTestId('isolated-session-error')).toBeVisible()
  expect(evidence.requests.filter((url) => forbidden.test(url))).toEqual([])
})

test('ordinary login still resolves profile and opens its normal master cabinet', async ({ page }) => {
  await fixture(page, { token: false, origin: null })
  await page.route('**/api/auth/login', (route) => route.fulfill({ json: {
    access_token: 'test-ordinary-login', refresh_token: 'test-refresh', token_type: 'bearer',
  } }))
  await page.goto('/about')
  await page.getByTestId('header-login').first().click()
  const modal = page.getByTestId('auth-modal')
  await modal.locator('input[name="phone"]').fill('+79990000000')
  await modal.locator('input[name="password"]').fill('testpassword')
  await page.getByTestId('auth-login-submit').click()
  await expect(modal).not.toBeVisible()
  await expect(page).toHaveURL(/\/master/)
  await expect(page.getByRole('complementary', { name: 'Навигация кабинета' })).toBeVisible()
  await expect(page.getByText('Мой тариф', { exact: true }).first()).toBeVisible()
})

test('ordinary web past accounting operation remains available', async ({ page }) => {
  await fixture(page, { origin: null, plan: 'Paid' })
  await page.goto('/master?tab=schedule')
  await page.getByRole('tab', { name: 'Прошедшие записи', exact: true }).click()
  await expect(page.getByText('Изменить статус', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible()
})

async function captureAnalytics(page: Page) {
  await page.addInitScript(() => {
    ;(window as any).__analyticsCalls = []
    ;(window as any).ym = (...args: unknown[]) => (window as any).__analyticsCalls.push(args)
  })
}

async function analyticsCalls(page: Page): Promise<any[][]> {
  return page.evaluate(() => (window as any).__analyticsCalls)
}

for (const query of [
  '',
  '?code=SYNTHETIC_HANDOFF_TICKET',
  '?source=ios&code=SYNTHETIC_HANDOFF_TICKET',
  '?%63ode=SYNTHETIC%5FHANDOFF%5FTICKET#access_token=SYNTHETIC_FRAGMENT',
]) {
  test(`analytics sanitizes handoff before lazy module loads: ${query || 'no code'}`, async ({ page }) => {
    await fixture(page, { origin: null, exchangeError: true })
    await captureAnalytics(page)
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    let moduleRequested = false
    await page.route('**/src/pages/MobileHandoff.jsx', async (route) => {
      moduleRequested = true
      await pending
      await route.continue()
    })
    try {
      await page.goto('/auth/mobile-handoff' + query, { waitUntil: 'domcontentloaded' })
      await expect.poll(() => moduleRequested).toBe(true)
      await expect.poll(async () => (await analyticsCalls(page)).filter((a) => a[1] === 'hit').length).toBeGreaterThan(0)
      // The URL is still untouched: sanitization cannot be credited to replaceState.
      expect(new URL(page.url()).search).toBe(new URL('https://example.com/' + query).search)
      await expect(page.getByTestId('isolated-session-error')).toHaveCount(0)
      const before = await analyticsCalls(page)
      expect(before.filter((a) => a[1] === 'hit').map((a) => a[2])).toEqual(['/auth/mobile-handoff'])
      expect(JSON.stringify(before)).not.toMatch(/SYNTHETIC|code=|%63ode=|access_token=/i)
      await test.info().attach('safe-lazy-order-evidence', {
        body: JSON.stringify({ moduleDelayed: true, pageviewBeforeCleanup: true, routes: before.filter((a) => a[1] === 'hit').map((a) => a[2]), sensitivePayload: false }),
        contentType: 'application/json',
      })
    } finally {
      release()
    }
    await expect(page.getByTestId('isolated-session-error')).toBeVisible()
    await expect(page).not.toHaveURL(/code=/)
    // SPA navigation/re-render must not revive the ticket in any analytics call.
    for (const path of ['/about', '/auth/mobile-handoff?code=SYNTHETIC_SECOND_TICKET']) {
      await page.evaluate((path) => {
        history.pushState({}, '', path)
        dispatchEvent(new PopStateEvent('popstate'))
      }, path)
      if (path === '/about') await expect(page.locator('main')).toBeVisible()
      else await expect(page.getByTestId('isolated-session-error')).toBeVisible()
    }
    expect(JSON.stringify(await analyticsCalls(page))).not.toMatch(/SYNTHETIC|code=|access_token=/i)
  })
}

for (const outcome of [400, 410, 500, 'network'] as const) {
  test(`analytics and console keep failed handoff ${outcome} credential-free`, async ({ page }) => {
    await fixture(page, { origin: null })
    await captureAnalytics(page)
    const consoleMessages: string[] = []
    page.on('console', (message) => consoleMessages.push(message.text()))
    await page.route('**/api/auth/web-handoff/exchange', (route) => outcome === 'network'
      ? route.abort()
      : route.fulfill({ status: outcome, json: { detail: 'SYNTHETIC_HANDOFF_TICKET must not be echoed' } }))
    await page.goto('/auth/mobile-handoff?code=SYNTHETIC_HANDOFF_TICKET')
    await expect(page.getByTestId('isolated-session-error')).toBeVisible()
    await expect.poll(async () => (await analyticsCalls(page)).filter((a) => a[1] === 'hit').length).toBeGreaterThan(0)
    expect(JSON.stringify(await analyticsCalls(page))).not.toMatch(/SYNTHETIC|code=/i)
    expect(consoleMessages.join('\n')).not.toContain('SYNTHETIC_HANDOFF_TICKET')
    await expect(page.locator('body')).not.toContainText('SYNTHETIC_HANDOFF_TICKET')
    await expect(page.locator('a')).toHaveCount(0)
  })
}

test('ordinary analytics keeps safe query dimensions and anchors after navigation', async ({ page }) => {
  await fixture(page, { token: false, origin: null })
  await captureAnalytics(page)
  await page.goto('/about?utm_source=mail#features')
  await expect.poll(async () => (await analyticsCalls(page)).filter((a) => a[1] === 'hit').map((a) => a[2]))
    .toContain('/about?utm_source=mail#features')
  await page.evaluate(() => {
    history.pushState({}, '', '/pricing?subscription_type=master&utm_source=mail#plans')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect.poll(async () => (await analyticsCalls(page)).filter((a) => a[1] === 'hit').map((a) => a[2]))
    .toContain('/pricing?subscription_type=master&utm_source=mail#plans')
})
