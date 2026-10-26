import { readFileSync } from 'node:fs'
import { parse } from '@babel/parser'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { transformWithEsbuild } from 'vite'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = { current: {} }
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth.current }))

const { AdminAccessContext } = await import('../contexts/AdminAccessContext')
const { default: AdminSectionGate } = await import('./AdminSectionGate')
const { default: AdminSidebar } = await import('./AdminSidebar')
const {
  ADMIN_ACCESS_STATUS, ADMIN_SECTIONS, canPerformAction, isStaffRole, normalizeAccess, normalizeRole, resolveAdminSection,
} = await import('../utils/adminAccess')

const h = React.createElement

function accessValue(status, payload) {
  const access = payload ? normalizeAccess(payload) : null
  return {
    status,
    access,
    refresh: vi.fn(),
    can: (action) => status === ADMIN_ACCESS_STATUS.READY && canPerformAction(access, action),
  }
}
const ready = (role, permissions = {}) => accessValue(ADMIN_ACCESS_STATUS.READY, { role, permissions })

function renderAt(path, value, element) {
  return renderToStaticMarkup(
    h(MemoryRouter, { initialEntries: [path] },
      h(AdminAccessContext.Provider, { value },
        h(Routes, null,
          h(Route, { path: '/admin/*', element }),
          h(Route, { path: '*', element: h('span', null, 'outside-admin') }),
        ))))
}

function gate(section, value, path = '/admin') {
  const mounted = vi.fn()
  function Page() {
    mounted()
    return h('div', { 'data-page': section }, 'page-content')
  }
  const html = renderAt(path, value, h(AdminSectionGate, { section }, h(Page)))
  return { html, mounted }
}

beforeEach(() => {
  auth.current = { user: { id: 1, role: 'moderator', full_name: 'Test Staff' }, openAuthModal: vi.fn() }
})

describe('AdminSectionGate mounts a page only when the server allows it', () => {
  it('ADMIN opens every section', () => {
    for (const section of ADMIN_SECTIONS) {
      const { html, mounted } = gate(section.key, ready('admin'))
      expect(mounted).toHaveBeenCalledTimes(1)
      expect(html).toContain('page-content')
    }
  })

  it.each(['moderators', 'functions', 'promo-engine', 'settings'])(
    'MODERATOR with every grant cannot mount admin-only %s', (section) => {
      const all = Object.fromEntries(['can_view_users', 'can_edit_users', 'can_delete_users', 'can_view_blog',
        'can_create_blog', 'can_edit_blog', 'can_delete_blog', 'can_publish_blog', 'can_view_stats',
        'can_view_promo_codes', 'can_create_promo_codes', 'can_edit_promo_codes', 'can_delete_promo_codes',
        'can_edit_settings', 'can_view_settings'].map((name) => [name, true]))
      const { html, mounted } = gate(section, ready('moderator', all), `/admin/${section}`)
      expect(mounted).not.toHaveBeenCalled()
      expect(html).toContain('data-testid="admin-forbidden"')
      expect(html).toContain('href="/admin"')
    })

  it('forbidden deep link links to the first permitted section', () => {
    const { html, mounted } = gate('users', ready('moderator', { can_view_blog: true }), '/admin/users')
    expect(mounted).not.toHaveBeenCalled()
    expect(html).toContain('data-testid="admin-forbidden"')
    expect(html).toContain('href="/admin/blog"')
  })

  it('moderator without dashboard is redirected inside /admin, never to /master', () => {
    const value = ready('moderator', { can_view_users: true })
    const { html, mounted } = gate('dashboard', value)
    expect(mounted).not.toHaveBeenCalled()
    expect(html).toBe('')
    expect(resolveAdminSection(value, 'dashboard')).toEqual({ type: 'redirect', to: '/admin/users' })
  })

  it('moderator without sections sees the empty state', () => {
    const { html, mounted } = gate('dashboard', ready('moderator'))
    expect(mounted).not.toHaveBeenCalled()
    expect(html).toContain('data-testid="admin-no-sections"')
    expect(html).toContain('Нет доступных разделов')
  })

  it.each([
    [ADMIN_ACCESS_STATUS.LOADING, 'admin-access-loading'],
    [ADMIN_ACCESS_STATUS.UNAUTHORIZED, 'admin-session-expired'],
    [ADMIN_ACCESS_STATUS.FORBIDDEN, 'admin-not-staff'],
    [ADMIN_ACCESS_STATUS.ERROR, 'admin-access-error'],
  ])('%s never mounts the page', (status, testId) => {
    const { html, mounted } = gate('users', accessValue(status, null), '/admin/users')
    expect(mounted).not.toHaveBeenCalled()
    expect(html).toContain(`data-testid="${testId}"`)
  })

  it('a stale localStorage role cannot open a section without the provider', () => {
    const storage = new Map([['user_role', 'admin'], ['access_token', 'stale']])
    vi.stubGlobal('window', { localStorage: { getItem: (key) => storage.get(key) ?? null } })
    auth.current = { user: { id: 1, role: 'admin' }, openAuthModal: vi.fn() }
    const html = renderToStaticMarkup(
      h(MemoryRouter, { initialEntries: ['/admin/settings'] },
        h(AdminSectionGate, { section: 'settings' }, h('div', null, 'page-content'))))
    vi.unstubAllGlobals()
    expect(html).not.toContain('page-content')
    expect(html).toContain('data-testid="admin-access-loading"')
  })
})

describe('AdminSidebar is the same component for both roles', () => {
  const navKeys = (html) => [...html.matchAll(/data-testid="admin-nav-([a-z-]+)"/g)].map((match) => match[1])

  it('ADMIN sees every section', () => {
    auth.current = { user: { id: 1, role: 'admin', full_name: 'Admin Person', email: 'admin@example.test' } }
    const html = renderAt('/admin', ready('admin'), h(AdminSidebar))
    expect(navKeys(html)).toEqual(ADMIN_SECTIONS.map((section) => section.key))
    expect(html).toContain('Администратор')
    expect(html).not.toContain('Appointo')
  })

  it('MODERATOR sees only granted sections in the same shell', () => {
    const html = renderAt('/admin/blog', ready('moderator', { can_view_blog: true, can_view_users: true }), h(AdminSidebar))
    expect(navKeys(html)).toEqual(['users', 'blog', 'always-free-logs'])
    expect(html).toContain('data-testid="admin-sidebar"')
    expect(html).toContain('Модератор')
    expect(html).toContain('aria-current="page"')
  })

  it.each([ADMIN_ACCESS_STATUS.LOADING, ADMIN_ACCESS_STATUS.ERROR, ADMIN_ACCESS_STATUS.UNAUTHORIZED])(
    'no navigation while the snapshot is %s', (status) => {
      auth.current = { user: { id: 1, role: 'admin' } }
      expect(navKeys(renderAt('/admin', accessValue(status, null), h(AdminSidebar)))).toEqual([])
    })
})

const { default: MasterWorkspaceRoute } = await import('./MasterWorkspaceRoute')

describe('MasterWorkspaceRoute never flashes the master cabinet for staff', () => {
  function renderMaster(state) {
    auth.current = { isIosAppWebSession: false, loading: false, ...state }
    const mounted = vi.fn()
    function Cabinet() {
      mounted()
      return h('div', null, 'master-cabinet')
    }
    const html = renderToStaticMarkup(
      h(MemoryRouter, { initialEntries: ['/master?tab=schedule'] },
        h(MasterWorkspaceRoute, { fallback: h('span', null, 'waiting') }, h(Cabinet))))
    return { html, mounted }
  }

  it.each([
    ['session bootstrap', { loading: true, user: null }],
    ['session re-check with a known staff user', { loading: true, user: { id: 1, role: 'admin' } }],
    ['admin before the profile probe', { user: { id: 1, role: 'admin' } }],
    ['moderator before the profile probe', { user: { id: 7, role: 'moderator' } }],
  ])('%s: waits without mounting the cabinet', (_, state) => {
    const { html, mounted } = renderMaster(state)
    expect(html).toBe('<span>waiting</span>')
    expect(mounted).not.toHaveBeenCalled()
  })

  it.each([
    ['master', { user: { id: 30, role: 'master' } }],
    ['indie', { user: { id: 31, role: 'indie' } }],
    ['guest', { user: null }],
    ['iOS app staff session', { user: { id: 1, role: 'admin' }, isIosAppWebSession: true }],
    ['demo session', { user: { id: 1, role: 'moderator', is_demo_session: true } }],
  ])('%s keeps the cabinet without waiting', (_, state) => {
    const { html, mounted } = renderMaster(state)
    expect(html).toBe('<div>master-cabinet</div>')
    expect(mounted).toHaveBeenCalledTimes(1)
  })
})

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')
const appAst = parse(appSource, { sourceType: 'module', plugins: ['jsx'] })
const extract = async (name) => {
  const node = appAst.program.body.find((n) => n.type === 'FunctionDeclaration' && n.id.name === name)
  const out = await transformWithEsbuild(appSource.slice(node.start, node.end), `${name}.jsx`,
    { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement' })
  return out.code
}
const adminRouteCode = (await extract('getPostAdminDenyPath')) + (await extract('AdminRoute'))

function renderAdminRoute(state) {
  const openAuthModal = vi.fn()
  const AdminRoute = Function(
    'React', 'useAuth', 'useLocation', 'useEffect', 'Navigate', 'PageLoader', 'AdminAccessProvider',
    'AdminLayout', 'Outlet', 'isStaffRole', 'normalizeRole',
    `${adminRouteCode};return AdminRoute`,
  )(
    React,
    () => ({ openAuthModal, ...state }),
    () => ({ pathname: '/admin/users', search: '?page=2' }),
    (effect) => effect(),
    ({ to }) => h('nav-to', null, to),
    () => h('span', null, 'loader'),
    ({ children }) => h('access-provider', null, children),
    ({ children }) => h('admin-layout', null, children),
    () => h('span', null, 'section'),
    isStaffRole,
    normalizeRole,
  )
  return { html: renderToStaticMarkup(h(AdminRoute)), openAuthModal }
}

describe('AdminRoute admits only ADMIN and MODERATOR', () => {
  it.each(['admin', 'moderator', 'ADMIN', 'Moderator'])('%s enters the shared shell', (role) => {
    const { html, openAuthModal } = renderAdminRoute({ loading: false, isAuthenticated: true, user: { id: 1, role } })
    expect(html).toBe('<access-provider><admin-layout><span>section</span></admin-layout></access-provider>')
    expect(openAuthModal).not.toHaveBeenCalled()
  })

  it.each([
    ['master', '/master'], ['indie', '/master'], ['salon', '/salon'], ['client', '/'], ['', '/'], ['superuser', '/'],
  ])('%s is sent to %s without the admin shell', (role, target) => {
    const { html } = renderAdminRoute({ loading: false, isAuthenticated: true, user: { id: 2, role } })
    expect(html).toBe(`<nav-to>${target}</nav-to>`)
  })

  it('anonymous visitor gets the login modal with returnTo to the deep link', () => {
    const { html, openAuthModal } = renderAdminRoute({ loading: false, isAuthenticated: false, user: null })
    expect(html).toBe('<nav-to>/</nav-to>')
    expect(openAuthModal).toHaveBeenCalledWith('client', 'login',
      { redirectMode: 'returnTo', returnToPath: '/admin/users?page=2' })
  })

  it('session bootstrap shows a loader and renders nothing protected', () => {
    const { html, openAuthModal } = renderAdminRoute({ loading: true, isAuthenticated: false, user: null })
    expect(html).toBe('<span>loader</span>')
    expect(openAuthModal).not.toHaveBeenCalled()
  })

  it('every /admin child route is gated by its registered section', () => {
    for (const section of ADMIN_SECTIONS) {
      const child = section.key === 'dashboard' ? '<Route index element=' : `<Route path="${section.path.replace('/admin/', '')}" element=`
      expect(appSource).toContain(`${child}{<AdminSectionGate section="${section.key}">`)
    }
    expect(appSource).toContain('<Route path="/admin" element={<AdminRoute />}>')
    expect(appSource).not.toMatch(/path="\/admin\/[a-z-]+" element=\{<AdminRoute>/)
  })
})
