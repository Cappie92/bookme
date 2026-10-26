import { test, expect, type Page, type Route } from '@playwright/test'

/**
 * Mocked contract for the shared ADMIN/MODERATOR shell. The mock enforces the
 * same per-endpoint permissions as backend/routers/admin.py and records every
 * request it would have rejected, so a passing test proves the UI neither
 * shows nor calls what the server snapshot does not allow.
 */

type Role = 'admin' | 'moderator' | 'master' | 'client'
type Grants = Partial<Record<string, boolean>>

const PERMISSION_NAMES = [
  'can_view_users', 'can_edit_users', 'can_delete_users', 'can_ban_users',
  'can_view_blog', 'can_create_blog', 'can_edit_blog', 'can_delete_blog', 'can_publish_blog',
  'can_view_settings', 'can_edit_settings', 'can_view_stats',
  'can_view_bookings', 'can_edit_bookings', 'can_delete_bookings',
  'can_view_masters', 'can_edit_masters', 'can_view_salons', 'can_edit_salons',
  'can_view_promo_codes', 'can_create_promo_codes', 'can_edit_promo_codes', 'can_delete_promo_codes',
]
const ADMIN_ONLY = 'ADMIN_ONLY'

const STATS = {
  total_users: 42, total_masters: 12, total_salons: 3, total_bookings: 310, total_blog_posts: 4,
  new_users_today: 2, new_users_this_week: 9, new_users_this_month: 21,
  bookings_today: 5, bookings_this_week: 40, conversion_rate: 12.5, average_booking_duration: 60,
  users_by_role: { client: 27, master: 12, admin: 1, moderator: 2 },
  top_salons: [], weekly_activity: [],
}
const USERS = [
  { id: 11, role: 'client', full_name: 'Клиент Тестовый', phone: '+79990000011', email: 'client@example.test', is_active: true, is_verified: true, created_at: '2026-01-01T10:00:00' },
  { id: 12, role: 'master', full_name: 'Мастер Тестовый', phone: '+79990000012', email: 'master@example.test', is_active: true, is_verified: true, created_at: '2026-01-02T10:00:00' },
  { id: 13, role: 'moderator', full_name: 'Модератор Коллега', phone: '+79990000013', email: 'mod2@example.test', is_active: true, is_verified: true, created_at: '2026-01-03T10:00:00' },
  { id: 14, role: 'admin', full_name: 'Админ Главный', phone: '+79990000014', email: 'boss@example.test', is_active: true, is_verified: true, created_at: '2026-01-04T10:00:00' },
]
const POSTS = [
  { id: 101, title: 'Черновик статьи', slug: 'draft-post', status: 'draft', tags: [], created_at: '2026-02-01T10:00:00', updated_at: '2026-02-01T10:00:00' },
  { id: 102, title: 'Опубликованная статья', slug: 'published-post', status: 'published', tags: [], created_at: '2026-02-02T10:00:00', updated_at: '2026-02-02T10:00:00', published_at: '2026-02-02T10:00:00' },
]

function rule(method: string, path: string, body: Record<string, unknown> | null): string | string[] | null {
  if (path === '/api/admin/access') return null
  if (path === '/api/admin/stats') return 'can_view_stats'
  if (path.startsWith('/api/admin/always-free')) return 'can_view_users'
  if (path === '/api/admin/users' || path.startsWith('/api/admin/users/')) {
    if (method === 'GET') return 'can_view_users'
    if (method === 'DELETE') return 'can_delete_users'
    if (method === 'PUT') {
      const authority = ['role', 'is_active', 'is_verified', 'is_phone_verified', 'is_always_free', 'always_free_plan_id']
      if (body && authority.some((key) => key in body)) return ADMIN_ONLY
      return 'can_edit_users'
    }
  }
  if (path.startsWith('/api/admin/blog')) {
    if (path.endsWith('/publish')) return 'can_publish_blog'
    if (method === 'GET') return 'can_view_blog'
    if (method === 'DELETE') return 'can_delete_blog'
    if (method === 'POST') {
      if (body && ((body.status && body.status !== 'draft') || body.published_at || body.scheduled_at)) return ['can_create_blog', 'can_publish_blog']
      return 'can_create_blog'
    }
    if (method === 'PUT') {
      if (body && ('status' in body || 'published_at' in body || 'scheduled_at' in body)) return ['can_edit_blog', 'can_publish_blog']
      return 'can_edit_blog'
    }
  }
  return ADMIN_ONLY
}

class StaffBackend {
  me: { id: number, role: Role, full_name: string, email?: string } | null
  grants: Grants = {}
  accessStatus = 200
  masterProfile = false
  masterProbe: 'network-error' | null = null
  meDelayMs = 0
  calls: string[] = []
  rejected: string[] = []
  writes: { method: string, path: string, body: Record<string, unknown> | null }[] = []

  constructor(role: Role | null, grants: Grants = {}) {
    this.me = role ? { id: role === 'admin' ? 1 : role === 'moderator' ? 7 : 30, role, full_name: `E2E ${role}`, email: `${role}@example.test` } : null
    this.grants = grants
  }

  allowed(permission: string | string[] | null): boolean {
    if (permission === null) return true
    if (this.me?.role === 'admin') return true
    if (this.me?.role !== 'moderator' || permission === ADMIN_ONLY) return false
    const names = Array.isArray(permission) ? permission : [permission]
    return names.every((name) => this.grants[name] === true)
  }

  snapshot() {
    const all = this.me?.role === 'admin'
    return { role: this.me?.role, permissions: Object.fromEntries(PERMISSION_NAMES.map((name) => [name, all || this.grants[name] === true])) }
  }

  async handle(route: Route) {
    const request = route.request()
    const url = new URL(request.url())
    const { pathname: path } = url
    const method = request.method()
    let body: Record<string, unknown> | null = null
    try { body = request.postDataJSON() } catch { body = null }
    this.calls.push(`${method} ${path}`)

    if (path === '/api/auth/users/me') {
      if (this.meDelayMs) await new Promise((resolve) => setTimeout(resolve, this.meDelayMs))
      if (!this.me) return route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })
      return route.fulfill({ json: { ...this.me, phone: '+79990000000', web_session_origin: null } })
    }
    if (path === '/api/auth/login' && method === 'POST') {
      const payload = Buffer.from(JSON.stringify({ sub: String(this.me?.id), role: this.me?.role })).toString('base64url')
      return route.fulfill({ json: { access_token: `e2e.${payload}.sig`, refresh_token: 'e2e-refresh', token_type: 'bearer' } })
    }
    if (path === '/api/master/settings') {
      if (this.masterProbe === 'network-error') return route.abort('connectionfailed')
      if (this.me?.role === 'master' || this.masterProfile) return route.fulfill({ json: { master: { id: 1 }, user: this.me } })
      return route.fulfill({ status: 404, json: { detail: 'Master not found' } })
    }
    if (!path.startsWith('/api/admin')) return route.fulfill({ json: {} })

    if (!this.me) return route.fulfill({ status: 401, json: { detail: 'Not authenticated' } })
    if (this.me.role !== 'admin' && this.me.role !== 'moderator') {
      this.rejected.push(`${method} ${path}`)
      return route.fulfill({ status: 403, json: { detail: 'Forbidden' } })
    }
    if (path === '/api/admin/access') {
      if (this.accessStatus !== 200) return route.fulfill({ status: this.accessStatus, json: { detail: 'denied' } })
      return route.fulfill({ json: this.snapshot(), headers: { 'Cache-Control': 'no-store' } })
    }
    if (!this.allowed(rule(method, path, body))) {
      this.rejected.push(`${method} ${path}`)
      return route.fulfill({ status: 403, json: { detail: 'Недостаточно прав' } })
    }
    if (method !== 'GET') this.writes.push({ method, path, body })

    if (path === '/api/admin/stats') return route.fulfill({ json: STATS })
    if (path === '/api/admin/users') return route.fulfill({ json: { items: USERS, total: USERS.length } })
    if (path.startsWith('/api/admin/users/') && method === 'PUT') {
      const id = Number(path.split('/').pop())
      return route.fulfill({ json: { ...USERS.find((user) => user.id === id), ...body } })
    }
    if (path === '/api/admin/blog/posts' && method === 'GET') return route.fulfill({ json: POSTS })
    if (path === '/api/admin/blog/posts' && method === 'POST') return route.fulfill({ json: { id: 103, ...body } })
    if (path === '/api/admin/blog/tags') return route.fulfill({ json: [] })
    if (path === '/api/admin/always-free-logs') return route.fulfill({ json: [] })
    if (path === '/api/admin/always-free-stats') return route.fulfill({ json: { total_always_free_users: 0, total_changes: 0 } })
    if (path === '/api/admin/promo-engine/stats') return route.fulfill({ json: { total_campaigns: 0, active_campaigns: 0, total_codes: 0, active_codes: 0, total_redemptions: 0, pending_redemptions: 0, redeemed_redemptions: 0, total_grants: 0, applied_grants: 0, total_points_granted: 0, total_ledger_entries: 0, total_ledger_points: 0 } })
    if (path.startsWith('/api/admin/promo-engine/')) return route.fulfill({ json: { items: [], total: 0, skip: 0, limit: 50 } })
    return route.fulfill({ json: [] })
  }
}

async function setup(page: Page, backend: StaffBackend, { token = true } = {}) {
  if (token && backend.me) {
    const role = backend.me.role
    await page.addInitScript((r) => {
      localStorage.setItem('access_token', `e2e-${r}-token`)
      localStorage.setItem('user_role', r)
    }, role)
  }
  await page.route('**/api/**', (route) => backend.handle(route))
}

const nav = (page: Page) => page.locator('[data-testid^="admin-nav-"]')
async function navKeys(page: Page) {
  await expect(page.getByTestId('admin-sidebar')).toBeVisible()
  return (await nav(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.replace('admin-nav-', ''))))
}
const ALL_SECTIONS = ['dashboard', 'users', 'moderators', 'blog', 'stats', 'functions', 'promo-engine', 'always-free-logs', 'settings']

test.describe('shared admin shell', () => {
  test('ADMIN keeps the full panel and dashboard', async ({ page }) => {
    const backend = new StaffBackend('admin')
    await setup(page, backend)
    await page.goto('/admin')

    await expect(page.getByRole('heading', { name: 'Панель администратора' })).toBeVisible()
    await expect.poll(() => navKeys(page)).toEqual(ALL_SECTIONS)
    await expect(page.getByTestId('admin-identity-role')).toContainText('Администратор')
    await expect(page.getByTestId('admin-quick-users.view')).toBeVisible()
    await expect(page.getByTestId('admin-quick-blog.create')).toBeVisible()
    await expect(page.getByTestId('admin-stat-bookings-week')).toHaveText(String(STATS.bookings_this_week))
    await expect(page.getByText('Новые пользователи')).toBeVisible()
    await expect(page.getByText('Последние действия')).toHaveCount(0)
    await expect(page.getByText(/минут[ыу]? назад|час назад/)).toHaveCount(0)
    await expect(page.getByText('DAU', { exact: true })).toHaveCount(0)
    expect(backend.rejected).toEqual([])
  })

  test('MODERATOR uses the same shell with only granted sections and no forbidden requests', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_users: true, can_view_blog: true })
    await setup(page, backend)
    await page.goto('/admin')

    await expect(page).toHaveURL(/\/admin\/users$/)
    await expect.poll(() => navKeys(page)).toEqual(['users', 'blog', 'always-free-logs'])
    await expect(page.getByTestId('admin-identity-role')).toContainText('Модератор')
    await expect(page.getByText('Клиент Тестовый')).toBeVisible()
    await expect(page.locator('button[title="Редактировать"]')).toHaveCount(0)
    await expect(page.locator('button[title="Удалить"]')).toHaveCount(0)

    await page.getByTestId('admin-nav-blog').click()
    await expect(page.getByText('Черновик статьи')).toBeVisible()
    await expect(page.getByTestId('admin-blog-create')).toHaveCount(0)
    await expect(page.getByTestId('admin-blog-import')).toHaveCount(0)
    await expect(page.locator('button[title="Редактировать"], button[title="Удалить"], button[title="Опубликовать"]')).toHaveCount(0)

    await page.getByTestId('admin-nav-always-free-logs').click()
    await expect(page).toHaveURL(/always-free-logs/)

    expect(backend.rejected).toEqual([])
    expect(backend.calls).not.toContain('GET /api/admin/stats')
  })

  test('MODERATOR with stats lands on the shared dashboard', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_stats: true })
    await setup(page, backend)
    await page.goto('/admin')

    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { name: 'Панель администратора' })).toBeVisible()
    await expect.poll(() => navKeys(page)).toEqual(['dashboard', 'stats'])
    await expect(page.getByTestId('admin-quick-stats.view')).toBeVisible()
    await expect(page.getByTestId('admin-quick-users.view')).toHaveCount(0)
    await expect(page.getByTestId('admin-quick-blog.create')).toHaveCount(0)
    await expect(page.getByText('Последние действия')).toHaveCount(0)
    await expect(page.getByText(/минут[ыу]? назад|час назад/)).toHaveCount(0)
    expect(backend.rejected).toEqual([])
  })

  for (const section of ['settings', 'moderators', 'functions', 'promo-engine', 'stats']) {
    test(`MODERATOR deep link to /admin/${section} stays forbidden after reload`, async ({ page }) => {
      const backend = new StaffBackend('moderator', { can_view_users: true, can_view_promo_codes: true, can_edit_settings: true })
      await setup(page, backend)
      await page.goto(`/admin/${section}`)
      await expect(page.getByTestId('admin-forbidden')).toBeVisible()
      await expect(page.getByTestId('admin-forbidden').getByRole('link')).toHaveAttribute('href', '/admin/users')
      await page.reload()
      await expect(page.getByTestId('admin-forbidden')).toBeVisible()
      await expect(page).toHaveURL(new RegExp(`/admin/${section}$`))
      expect(backend.rejected).toEqual([])
    })
  }

  test('MODERATOR without permissions sees "Нет доступных разделов", not the master cabinet', async ({ page }) => {
    const backend = new StaffBackend('moderator', {})
    await setup(page, backend)
    await page.goto('/admin')
    await expect(page.getByTestId('admin-no-sections')).toContainText('Нет доступных разделов')
    await expect(page).toHaveURL(/\/admin$/)
    expect(await navKeys(page)).toEqual([])
    expect(backend.rejected).toEqual([])
  })

  test('MODERATOR profile edit is limited to profile fields and non-staff users', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_users: true, can_edit_users: true })
    await setup(page, backend)
    await page.goto('/admin/users')

    const row = (name: string) => page.locator('tr', { hasText: name })
    await expect(row('Клиент Тестовый').locator('button[title="Редактировать"]')).toBeVisible()
    await expect(row('Модератор Коллега').locator('button[title="Редактировать"]')).toHaveCount(0)
    await expect(row('Админ Главный').locator('button[title="Редактировать"]')).toHaveCount(0)
    await expect(page.locator('button[title="Удалить"]')).toHaveCount(0)

    await row('Клиент Тестовый').locator('button[title="Редактировать"]').click()
    const form = page.locator('form', { has: page.locator('input[name="full_name"]') })
    await expect(form.locator('select[name="role"]')).toHaveCount(0)
    await expect(form.locator('input[name="is_active"], input[name="is_verified"], input[name="is_always_free"]')).toHaveCount(0)
    await expect(form.getByTestId('admin-user-role-readonly')).toBeVisible()
    await form.locator('input[name="full_name"]').fill('Клиент Обновлённый')
    await form.getByRole('button', { name: 'Сохранить' }).click()

    await expect.poll(() => backend.writes.length).toBe(1)
    expect(backend.writes[0].path).toBe('/api/admin/users/11')
    expect(Object.keys(backend.writes[0].body || {}).sort()).toEqual(['email', 'full_name', 'phone'])
    expect(backend.rejected).toEqual([])
  })

  test('ADMIN profile edit keeps authority fields', async ({ page }) => {
    const backend = new StaffBackend('admin')
    await setup(page, backend)
    await page.goto('/admin/users')
    await page.locator('tr', { hasText: 'Модератор Коллега' }).locator('button[title="Редактировать"]').click()
    const form = page.locator('form', { has: page.locator('input[name="full_name"]') })
    await expect(form.locator('select[name="role"]')).toBeVisible()
    await expect(form.locator('input[name="is_active"]')).toBeVisible()
    await expect(form.locator('input[name="is_always_free"]')).toBeVisible()
    await form.getByRole('button', { name: 'Сохранить' }).click()
    await expect.poll(() => backend.writes.length).toBe(1)
    expect(backend.writes[0].body).toMatchObject({ role: 'moderator', is_active: true })
  })

  test('MODERATOR blog author without publish creates drafts only', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_blog: true, can_create_blog: true, can_edit_blog: true })
    await setup(page, backend)
    await page.goto('/admin/blog')

    await expect(page.getByTestId('admin-blog-create')).toBeVisible()
    await expect(page.locator('button[title="Редактировать"]')).toHaveCount(POSTS.length)
    await expect(page.locator('button[title="Опубликовать"], button[title="Удалить"]')).toHaveCount(0)
    await page.getByTestId('admin-blog-create').click()
    await expect(page.getByTestId('admin-blog-status')).toBeDisabled()
    expect(backend.rejected).toEqual([])
  })

  test('revoked permission is picked up from the server and closes the section', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_users: true })
    await setup(page, backend)
    await page.goto('/admin/users')
    await expect(page.getByText('Клиент Тестовый')).toBeVisible()

    backend.grants = {}
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByTestId('admin-no-sections')).toBeVisible()
    expect(await navKeys(page)).toEqual([])
  })

  test('a failed background refresh keeps the open form', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_users: true, can_edit_users: true })
    await setup(page, backend)
    await page.goto('/admin/users')
    await page.locator('tr', { hasText: 'Клиент Тестовый' }).locator('button[title="Редактировать"]').click()
    await page.locator('input[name="full_name"]').fill('Несохранённое имя')

    backend.accessStatus = 502
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect.poll(() => backend.calls.filter((call) => call === 'GET /api/admin/access').length).toBe(2)
    await expect(page.locator('input[name="full_name"]')).toHaveValue('Несохранённое имя')
  })

  test('expired session on the access snapshot asks to sign in again', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_users: true })
    backend.accessStatus = 401
    await setup(page, backend)
    await page.goto('/admin/users')
    await expect(page.getByTestId('admin-session-expired')).toBeVisible()
    expect(await navKeys(page)).toEqual([])
    expect(backend.calls).not.toContain('GET /api/admin/users')
  })

  test('fresh MODERATOR login lands on /admin and returnTo keeps the deep link', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_blog: true })
    const me = backend.me
    backend.me = null
    await setup(page, backend, { token: false })

    await page.goto('/admin/blog')
    await expect(page).toHaveURL(/\/$/)
    const modal = page.getByTestId('auth-modal')
    await expect(modal).toBeVisible()
    backend.me = me
    await modal.locator('input[name="phone"]').fill('+79990000007')
    await modal.locator('input[name="password"]').fill('e2e-password')
    await page.getByTestId('auth-login-submit').click()

    await expect(page).toHaveURL(/\/admin\/blog$/)
    await expect.poll(() => navKeys(page)).toEqual(['blog'])

    await page.evaluate(() => { localStorage.clear() })
    backend.me = null
    await page.goto('/')
    backend.me = me
    await page.getByRole('button', { name: /Войти/i }).first().click()
    await modal.locator('input[name="phone"]').fill('+79990000007')
    await modal.locator('input[name="password"]').fill('e2e-password')
    await page.getByTestId('auth-login-submit').click()
    await expect(page).toHaveURL(/\/admin\/blog$/)
  })

  test('role change on the server is reflected after reload', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_blog: true })
    await setup(page, backend)
    await page.goto('/admin')
    await expect.poll(() => navKeys(page)).toEqual(['blog'])

    backend.me = { ...backend.me!, role: 'admin' }
    await page.reload()
    await expect.poll(() => navKeys(page)).toEqual(ALL_SECTIONS)

    backend.me = { ...backend.me!, role: 'client' }
    await page.reload()
    await expect(page).not.toHaveURL(/\/admin/)
    await expect(page.getByTestId('admin-sidebar')).toHaveCount(0)
  })
})

async function watchMasterCabinet(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __masterCabinetSeen: boolean }
    w.__masterCabinetSeen = false
    // MasterDashboard's own auth/settings loader or its navigation.
    const seen = () => document.querySelector('[data-testid^="nav-"]') ||
      [...document.querySelectorAll('.min-h-screen.bg-white .text-xl')].some((el) => el.textContent === 'Загрузка...')
    new MutationObserver(() => {
      if (seen()) w.__masterCabinetSeen = true
    }).observe(document, { childList: true, subtree: true })
  })
  return () => page.evaluate(() => (window as unknown as { __masterCabinetSeen: boolean }).__masterCabinetSeen)
}
const masterCalls = (backend: StaffBackend) =>
  backend.calls.filter((call) => call.includes('/api/master/') && call !== 'GET /api/master/settings')

test.describe('no master cabinet flash for staff', () => {
  for (const [role, tab] of [['moderator', 'schedule'], ['admin', 'schedule'], ['moderator', 'dashboard']] as const) {
    test(`${role} without a master profile never mounts the master cabinet on /master?tab=${tab}`, async ({ page }) => {
      const backend = new StaffBackend(role, { can_view_blog: true })
      backend.meDelayMs = 600
      const masterSeen = await watchMasterCabinet(page)
      await setup(page, backend)
      await page.goto(`/master?tab=${tab}`)
      await expect(page).toHaveURL(/\/admin/)
      await expect(page.getByTestId('admin-sidebar')).toBeVisible()
      expect(await masterSeen()).toBe(false)
      expect(masterCalls(backend)).toEqual([])
      expect(backend.calls.filter((call) => call === 'GET /api/master/settings')).toHaveLength(1)
    })
  }

  test('staff with its own master profile waits for the probe, then gets the cabinet', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_blog: true })
    backend.masterProfile = true
    backend.meDelayMs = 600
    const masterSeen = await watchMasterCabinet(page)
    await setup(page, backend)
    await page.goto('/master?tab=dashboard')
    await expect(page.locator('[data-testid="nav-dashboard"]').first()).toBeAttached()
    expect(await masterSeen()).toBe(true)
    await expect(page).toHaveURL(/\/master\?tab=dashboard/)
    await expect(page.getByTestId('admin-sidebar')).toHaveCount(0)
  })

  test('a network error on the profile probe keeps the previous master behaviour, no redirect loop', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_blog: true })
    backend.masterProbe = 'network-error'
    await setup(page, backend)
    await page.goto('/master?tab=dashboard')
    await expect(page.locator('[data-testid="nav-dashboard"]').first()).toBeAttached()
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/master\?tab=dashboard/)
    expect(backend.calls.filter((call) => call === 'GET /api/admin/access')).toEqual([])
  })

  test('MASTER still gets the cabinet with a slow session bootstrap and no admin calls', async ({ page }) => {
    const backend = new StaffBackend('master')
    backend.meDelayMs = 600
    await setup(page, backend)
    await page.goto('/master?tab=dashboard')
    await expect(page.locator('[data-testid="nav-dashboard"]').first()).toBeAttached()
    await expect(page).toHaveURL(/\/master\?tab=dashboard/)
    expect(backend.calls.filter((call) => call.includes('/api/admin/'))).toEqual([])
  })

  test('guest on /master is not held by the staff wait', async ({ page }) => {
    const backend = new StaffBackend(null)
    await setup(page, backend, { token: false })
    await page.goto('/master?tab=dashboard')
    await page.waitForTimeout(800)
    expect(backend.calls.filter((call) => call.includes('/api/admin/'))).toEqual([])
    await expect(page.getByTestId('admin-sidebar')).toHaveCount(0)
  })
})

test.describe('legacy /master entry', () => {
  test('MODERATOR without a master profile is routed from /master?tab=dashboard to /admin', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_blog: true })
    await setup(page, backend)
    await page.goto('/master?tab=dashboard')
    await expect(page).toHaveURL(/\/admin\/blog$/)
    await expect.poll(() => navKeys(page)).toEqual(['blog'])
  })

  test('ADMIN without a master profile is routed to /admin', async ({ page }) => {
    const backend = new StaffBackend('admin')
    await setup(page, backend)
    await page.goto('/master?tab=dashboard')
    await expect(page).toHaveURL(/\/admin$/)
  })

  test('staff account with its own master profile keeps the master cabinet', async ({ page }) => {
    const backend = new StaffBackend('moderator', { can_view_blog: true })
    backend.masterProfile = true
    await setup(page, backend)
    await page.goto('/master?tab=dashboard')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/master\?tab=dashboard/)
    await expect(page.getByTestId('admin-sidebar')).toHaveCount(0)
  })

  test('MASTER stays on /master and never calls the admin snapshot', async ({ page }) => {
    const backend = new StaffBackend('master')
    await setup(page, backend)
    await page.goto('/master?tab=dashboard')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/master\?tab=dashboard/)
    expect(backend.calls.filter((call) => call.includes('/api/admin/'))).toEqual([])
  })
})

test.describe('non-staff cannot enter /admin', () => {
  for (const [role, target] of [['master', /\/master/], ['client', /\/client|\/$/]] as const) {
    for (const path of ['/admin', '/admin/users', '/admin/settings', '/admin/promo-engine']) {
      test(`${role} on ${path}`, async ({ page }) => {
        const backend = new StaffBackend(role)
        await setup(page, backend)
        await page.goto(path)
        await expect(page).toHaveURL(target)
        await expect(page.getByTestId('admin-sidebar')).toHaveCount(0)
        expect(backend.calls.filter((call) => call.includes('/api/admin/'))).toEqual([])
      })
    }
  }

  test('guest on a deep link gets the login modal and no admin calls', async ({ page }) => {
    const backend = new StaffBackend(null)
    await setup(page, backend, { token: false })
    await page.goto('/admin/users')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('auth-modal')).toBeVisible()
    await expect(page.getByTestId('admin-sidebar')).toHaveCount(0)
    expect(backend.calls.filter((call) => call.includes('/api/admin/'))).toEqual([])
  })
})
