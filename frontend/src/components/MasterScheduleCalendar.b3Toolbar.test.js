/**
 * @vitest-environment happy-dom
 */
import { createElement, act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountDom, installLgViewport } from '../test/domHarness'
import MasterScheduleCalendar from './MasterScheduleCalendar'

const bookingState = vi.hoisted(() => ({
  rows: [],
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ isIosRestrictedContext: false }),
}))
vi.mock('../utils/api', () => ({
  apiGet: vi.fn(async (url) => {
    if (url.includes('/bookings/detailed')) return bookingState.rows
    if (url.includes('/schedule/rules')) return { has_settings: false }
    if (url.includes('/schedule/weekly')) return { slots: [] }
    return []
  }),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}))
vi.mock('../utils/calendarB3', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listCalendarBlocks: vi.fn(async () => []),
    deleteManualBooking: vi.fn(async (id) => {
      bookingState.rows = bookingState.rows.filter((row) => row.id !== id)
      return { id, deleted: true }
    }),
  }
})

const baseProps = {
  schedule: {},
  onChange: vi.fn(),
  currentWeekOffset: 0,
  setCurrentWeekOffset: vi.fn(),
  hasExtendedStats: true,
  masterSettings: { timezone: 'Europe/Moscow', master: { id: 1 } },
}

function todayManualAnna() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const dateStr = `${y}-${m}-${d}`
  return {
    id: 1,
    source: 'manual',
    guest_name: 'Анна',
    status: 'confirmed',
    start_time: `${dateStr}T11:00:00`,
    end_time: `${dateStr}T11:30:00`,
    version: 2,
  }
}

beforeEach(() => {
  installLgViewport()
  localStorage.clear()
  bookingState.rows = [todayManualAnna()]
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('MasterScheduleCalendar B3 toolbar', () => {
  it('opens week view by default with create actions visible', async () => {
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleCalendar, { ...baseProps, scheduleSurfaceKey: 0 }))
    await act(async () => { await Promise.resolve() })
    expect(ui.container.querySelector('[data-testid="master-week-timeline"]')).toBeTruthy()
    expect(ui.container.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Неделя')
    expect(ui.container.querySelector('[data-testid="master-schedule-create-actions"]')).toBeTruthy()
    await ui.unmount()
  })

  it('resets to week when schedule surface key changes', async () => {
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleCalendar, { ...baseProps, scheduleSurfaceKey: 0 }))
    await act(async () => { await Promise.resolve() })
    await ui.click('День')
    expect(ui.container.querySelector('[data-testid="master-day-agenda"]')).toBeTruthy()
    await ui.render(createElement(MasterScheduleCalendar, { ...baseProps, scheduleSurfaceKey: 1 }))
    await act(async () => { await Promise.resolve() })
    expect(ui.container.querySelector('[data-testid="master-week-timeline"]')).toBeTruthy()
    await ui.unmount()
  })

  it('opens manual booking composer from week toolbar without switching to day', async () => {
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleCalendar, baseProps))
    await act(async () => { await Promise.resolve() })
    await ui.click('+ Новая запись')
    expect(ui.container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(ui.container.textContent).toContain('Запись вручную')
    expect(ui.container.querySelector('[data-testid="master-week-timeline"]')).toBeTruthy()
    await ui.unmount()
  })

  it('opens personal block composer from week toolbar', async () => {
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleCalendar, baseProps))
    await act(async () => { await Promise.resolve() })
    const blockBtn = ui.container.querySelector('[data-testid="master-schedule-new-block"]')
    expect(blockBtn).toBeTruthy()
    await act(async () => { blockBtn.click() })
    await act(async () => { await Promise.resolve() })
    expect(ui.container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(ui.container.textContent).toContain('Личное событие')
    await ui.unmount()
  })

  it('switches to day view with inline create aside', async () => {
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleCalendar, baseProps))
    await act(async () => { await Promise.resolve() })
    await ui.click('День')
    expect(ui.container.querySelector('[data-testid="master-day-agenda"]')).toBeTruthy()
    expect(ui.container.querySelector('[data-testid="master-add-event"]')).toBeTruthy()
    await ui.unmount()
  })

  it('opens slot management drawer from schedule tab via Ещё', async () => {
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleCalendar, baseProps))
    await act(async () => { await Promise.resolve() })
    expect(ui.container.textContent).not.toContain('Источник')
    await ui.click('Расписание')
    expect(ui.container.querySelector('[data-testid="master-schedule-hub"]')).toBeTruthy()
    expect(ui.container.textContent).toContain('Текущее расписание')
    await act(async () => {
      ui.container.querySelector('[data-testid="master-schedule-more"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    await act(async () => {
      ui.container.querySelector('[data-testid="master-slot-management"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(ui.container.textContent).toContain('открытые и закрытые интервалы на день')
    await ui.unmount()
  })

  it('consumes dashboard manual intent into composer modal', async () => {
    const onConsumed = vi.fn()
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleCalendar, {
      ...baseProps,
      manualCreateIntentKey: 2,
      onManualCreateIntentConsumed: onConsumed,
    }))
    await act(async () => { await Promise.resolve() })
    expect(onConsumed).toHaveBeenCalled()
    expect(ui.container.querySelector('[role="dialog"]')).toBeTruthy()
    await ui.unmount()
  })

  it('clears day aside selection after delete reloads bookings', async () => {
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleCalendar, baseProps))
    await act(async () => { await Promise.resolve() })
    await ui.click('День')
    const eventButton = [...ui.container.querySelectorAll('button')].find((el) => el.textContent?.includes('Анна'))
    expect(eventButton).toBeTruthy()
    await act(async () => {
      eventButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    const nameField = [...ui.container.querySelectorAll('input')].find((el) => el.value === 'Анна')
    expect(nameField).toBeTruthy()
    await ui.click('Отменить')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(ui.container.textContent).toContain('Запись вручную')
    expect(ui.container.textContent).not.toContain('Анна')
    await ui.unmount()
  })
})