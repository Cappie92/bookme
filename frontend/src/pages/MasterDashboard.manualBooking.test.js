/**
 * @vitest-environment happy-dom
 */
import { createElement, act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { mountDom, installLgViewport } from '../test/domHarness'
import MasterDashboard from './MasterDashboard'
import MasterDashboardStats from '../components/MasterDashboardStats'
import { apiGet } from '../utils/api'

const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    weeks_data: [{
      is_current: true,
      bookings_total: 2,
      bookings_confirmed: 1,
      bookings_pending: 1,
      income_total_rub: 1000,
    }],
  }),
}))

let releaseScheduleLoad
let scheduleLoaded

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isIosRestrictedContext: false,
    isIosAppWebSession: false,
    loading: false,
    commerceAllowed: true,
  }),
}))
vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))
vi.mock('../hooks/useMasterSubscription', () => ({
  useMasterSubscription: () => ({
    hasFinanceAccess: true,
    hasExtendedStats: true,
    hasLoyaltyAccess: true,
    hasClientRestrictions: true,
    hasClientsAccess: true,
    loading: false,
    canCustomizeDomain: true,
    planName: 'Premium',
    refresh: vi.fn(),
  }),
}))
vi.mock('../utils/api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  apiRequest: vi.fn(),
}))
vi.mock('../components/Header', () => ({ default: () => null }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => children,
  ComposedChart: ({ children }) => createElement('div', null, children),
  Bar: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Cell: () => null,
}))

function defaultApiGet(url) {
  if (url.includes('/master/settings')) {
    return {
      master: { id: 1, timezone: 'Europe/Moscow' },
      user: { full_name: 'Иван Тестов' },
    }
  }
  if (url.includes('schedule/weekly') && url.includes('week_offset=0') && !scheduleLoaded) {
    return new Promise((resolve) => {
      releaseScheduleLoad = () => {
        scheduleLoaded = true
        resolve({ slots: [] })
      }
    })
  }
  if (url.includes('schedule/weekly')) return { slots: [] }
  if (url.includes('invitations')) return []
  if (url.includes('bookings/limit')) return { limit: 20, current: 0 }
  if (url.includes('bookings/detailed')) return []
  if (url.includes('past-appointments') || url.includes('bookings/future')) {
    return { appointments: [], bookings: [], total: 0 }
  }
  if (url.includes('balance') || url.includes('subscription')) return {}
  return {}
}

async function flushDashboardBoot(ui) {
  await act(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 150) })
    await Promise.resolve()
    await Promise.resolve()
  })
}

function composerOpen(container) {
  return Boolean(
    container.querySelector('[aria-label="Запись вручную"]')
    || container.textContent?.includes('Имя клиента'),
  )
}

beforeEach(() => {
  scheduleLoaded = false
  releaseScheduleLoad = null
  vi.mocked(apiGet).mockImplementation((url) => Promise.resolve(defaultApiGet(url)))
  localStorage.setItem('access_token', 'test-token')
  vi.stubGlobal('fetch', fetchMock)
  installLgViewport()
})

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('Master dashboard manual booking UX wiring', () => {
  it('hero schedule opens schedule tab without composer modal', async () => {
    scheduleLoaded = true
    const ui = mountDom()
    await ui.render(createElement(MemoryRouter, { initialEntries: ['/master?tab=dashboard'] },
      createElement(Routes, null,
        createElement(Route, { path: '/master', element: createElement(MasterDashboard) }),
      ),
    ))
    await flushDashboardBoot(ui)
    expect(ui.container.querySelector('[role="dialog"]')).toBeFalsy()
    await ui.click('Расписание')
    await act(async () => { await Promise.resolve() })
    expect(ui.container.querySelector('[data-testid="master-schedule-surface"]')).toBeTruthy()
    expect(ui.container.querySelector('[role="dialog"]')).toBeFalsy()
    await ui.unmount()
  })

  it('hero new booking switches to schedule and opens composer modal once', async () => {
    scheduleLoaded = true
    const ui = mountDom()
    await ui.render(createElement(MemoryRouter, { initialEntries: ['/master?tab=dashboard'] },
      createElement(Routes, null,
        createElement(Route, { path: '/master', element: createElement(MasterDashboard) }),
      ),
    ))
    await flushDashboardBoot(ui)
    const heroGrid = ui.container.querySelector('.grid-cols-2')
    const heroNew = heroGrid ? [...heroGrid.querySelectorAll('button')].find((b) => b.textContent?.includes('Новая запись')) : null
    expect(heroNew).toBeTruthy()
    await act(async () => {
      heroNew.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      for (let i = 0; i < 30; i += 1) {
        if (composerOpen(ui.container)) break
        await new Promise((resolve) => { setTimeout(resolve, 50) })
      }
      await Promise.resolve()
    })
    expect(ui.container.querySelector('[data-testid="master-schedule-surface"]')).toBeTruthy()
    expect(composerOpen(ui.container)).toBe(true)
    await ui.unmount()
  })

  it('keeps composer open through deferred schedule load and reopens on next hero click', async () => {
    const ui = mountDom()
    await ui.render(createElement(MemoryRouter, { initialEntries: ['/master?tab=dashboard'] },
      createElement(Routes, null,
        createElement(Route, { path: '/master', element: createElement(MasterDashboard) }),
      ),
    ))
    await flushDashboardBoot(ui)
    const heroGrid = ui.container.querySelector('.grid-cols-2')
    const heroNew = heroGrid ? [...heroGrid.querySelectorAll('button')].find((b) => b.textContent?.includes('Новая запись')) : null
    await act(async () => {
      heroNew.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((resolve) => { setTimeout(resolve, 80) })
    })
    expect(ui.container.querySelector('[data-testid="master-schedule-surface"]')).toBeTruthy()
    expect(composerOpen(ui.container)).toBe(true)
    await act(async () => {
      releaseScheduleLoad?.()
      await new Promise((resolve) => { setTimeout(resolve, 120) })
      await Promise.resolve()
    })
    expect(ui.container.querySelector('[data-testid="master-schedule-surface"]')).toBeTruthy()
    expect(composerOpen(ui.container)).toBe(true)
    const dialog = ui.container.querySelector('[aria-label="Запись вручную"]')?.closest('[role="dialog"]')
      || ui.container.querySelector('[role="dialog"]')
    const closeBtn = dialog
      ? [...dialog.querySelectorAll('button')].find((b) => b.textContent?.includes('Закрыть'))
      : null
    await act(async () => {
      closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(composerOpen(ui.container)).toBe(false)
    await ui.click('Дашборд')
    await flushDashboardBoot(ui)
    const heroNewAgain = ui.container.querySelector('.grid-cols-2')
      ? [...ui.container.querySelector('.grid-cols-2').querySelectorAll('button')].find((b) => b.textContent?.includes('Новая запись'))
      : null
    expect(heroNewAgain).toBeTruthy()
    await act(async () => {
      heroNewAgain.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      for (let i = 0; i < 30; i += 1) {
        if (composerOpen(ui.container)) break
        await new Promise((resolve) => { setTimeout(resolve, 50) })
      }
    })
    expect(composerOpen(ui.container)).toBe(true)
    await ui.unmount()
  })

  it('mobile stats row wires schedule, new booking, and public link', async () => {
    scheduleLoaded = true
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query) => ({
        matches: query !== '(min-width: 1024px)',
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
    const onNavigateSchedule = vi.fn()
    const onNewManualBooking = vi.fn()
    const onCopyPublicLink = vi.fn()
    const ui = mountDom()
    await ui.render(createElement(MemoryRouter, null,
      createElement(MasterDashboardStats, {
        onNavigateSchedule,
        onNewManualBooking,
        onCopyPublicLink,
        hasExtendedStats: true,
        settingsPayload: { master: { id: 1 } },
      }),
    ))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    await ui.click('Расписание')
    await ui.click('Новая запись')
    await ui.click('Ссылка записи')
    expect(onNavigateSchedule).toHaveBeenCalledTimes(1)
    expect(onNewManualBooking).toHaveBeenCalledTimes(1)
    expect(onCopyPublicLink).toHaveBeenCalledTimes(1)
    await ui.unmount()
  })
})