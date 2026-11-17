/**
 * @vitest-environment happy-dom
 */
import { createElement, act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { mountDom, installLgViewport, installMobileViewport } from '../../test/domHarness'
import MasterScheduleHeader from './MasterScheduleHeader'

const baseProps = {
  calendarLayoutMode: 'week',
  onLayoutModeChange: vi.fn(),
  showMonthlyView: false,
  showCreateActions: true,
  focusDay: new Date(2026, 10, 10),
  weekDates: Array.from({ length: 7 }, (_, i) => ({
    date: new Date(2026, 10, 9 + i),
  })),
  onPreviousPeriod: vi.fn(),
  onNextPeriod: vi.fn(),
  onToday: vi.fn(),
  onOpenNewBooking: vi.fn(),
  onOpenNewBlock: vi.fn(),
  masterTimezone: 'Europe/Moscow',
  monthNav: null,
}

describe('MasterScheduleHeader Figma 16.11', () => {
  it('desktop shows title row, outlined create actions, and segmented week control', async () => {
    installLgViewport()
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleHeader, baseProps))
    const header = ui.container.querySelector('[data-testid="master-schedule-header"]')
    expect(header).toBeTruthy()
    expect(header.textContent).toContain('Расписание')
    const weekTab = [...ui.container.querySelectorAll('[role="tab"]')].find((el) => el.textContent === 'Неделя')
    expect(weekTab?.getAttribute('aria-selected')).toBe('true')
    expect(weekTab?.className).toMatch(/surface-elevated|bg-\[var\(--dedato-surface-elevated/)
    expect(ui.container.querySelector('[data-testid="master-schedule-new-booking"]')?.textContent).toContain('+ Новая запись')
    const nav = ui.container.querySelector('[data-testid="master-schedule-period-nav"]')
    expect(nav).toBeTruthy()
    const todayBtn = nav.querySelector('[data-testid="master-week-today"]')
    const nextBtn = nav.querySelector('[data-testid="master-week-next"]')
    expect(todayBtn && nextBtn).toBeTruthy()
    expect(nextBtn.compareDocumentPosition(todayBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await ui.unmount()
  })

  it('tablist arrow keys move selection with roving tabindex', async () => {
    installLgViewport()
    const onLayoutModeChange = vi.fn()
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleHeader, { ...baseProps, onLayoutModeChange }))
    const tablist = ui.container.querySelector('[data-testid="master-schedule-mode-tabs"]')
    const weekTab = [...ui.container.querySelectorAll('[role="tab"]')].find((el) => el.textContent === 'Неделя')
    weekTab?.focus()
    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(onLayoutModeChange).toHaveBeenCalledWith('day')
    tablist.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(onLayoutModeChange).toHaveBeenCalledWith('schedule')
    await ui.unmount()
  })

  it('mobile header panels fit within a 350px column without fixed overflow width', async () => {
    installMobileViewport()
    const ui = mountDom()
    const shell = document.createElement('div')
    shell.style.width = '350px'
    document.body.appendChild(shell)
    shell.appendChild(ui.container)
    await ui.render(createElement(MasterScheduleHeader, baseProps))
    const tabs = ui.container.querySelector('[data-testid="master-schedule-mode-tabs"]')
    const actions = ui.container.querySelector('[data-testid="master-schedule-create-actions"]')
    const nav = ui.container.querySelector('[data-testid="master-schedule-period-nav"]')
    const shellRect = shell.getBoundingClientRect()
    for (const el of [tabs, actions, nav, ui.container.querySelector('[data-testid="master-schedule-new-block"]')]) {
      if (!el) continue
      const r = el.getBoundingClientRect()
      expect(r.left - shellRect.left).toBeGreaterThanOrEqual(-0.5)
      expect(r.right - shellRect.right).toBeLessThanOrEqual(0.5)
    }
    const bookingBtn = ui.container.querySelector('[data-testid="master-schedule-new-booking"]')
    expect(bookingBtn).toBeTruthy()
    if (bookingBtn.getBoundingClientRect().width > 0) {
      expect(Math.round(bookingBtn.getBoundingClientRect().width)).toBe(171)
    }
    shell.remove()
    await ui.unmount()
  })

  it('mobile shows timezone line from master IANA zone', async () => {
    installMobileViewport()
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleHeader, baseProps))
    await act(async () => { await Promise.resolve() })
    expect(ui.container.textContent).toMatch(/Москва/)
    expect(ui.container.textContent).toMatch(/UTC/)
    await ui.unmount()
  })
})