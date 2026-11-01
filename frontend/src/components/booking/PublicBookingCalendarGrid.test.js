/**
 * @vitest-environment happy-dom
 */
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CalendarGrid, resolveAutomaticMonth } from './PublicBookingCalendarGrid'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const WINDOW = { minDateStr: '2026-10-31', maxDateStr: '2026-11-14' }
const october = new Date(2026, 9, 31)
const november = new Date(2026, 10, 15)

function renderGrid(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const rerender = (next) => {
    act(() => {
      root.render(createElement(CalendarGrid, { onSelectDate() {}, ...next }))
    })
  }
  rerender(props)
  return {
    rerender,
    month: () => container.querySelector('[data-testid="calendar-month"]').getAttribute('data-month'),
    cells: () => [...container.querySelectorAll('[data-testid^="date-cell-"]')].map((node) => node.getAttribute('data-testid')),
    click(testId) {
      const button = container.querySelector(`[data-testid="${testId}"]`)
      expect(button).not.toBeNull()
      expect(button.disabled).toBe(false)
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('resolveAutomaticMonth', () => {
  it('keeps the current month when it has a slot', () => {
    expect(resolveAutomaticMonth(new Set(['2026-10-31', '2026-11-01']), WINDOW.minDateStr, WINDOW.maxDateStr, november))
      .toEqual({ year: 2026, month: 10 })
  })

  it('opens the first slotted month when the current month is empty', () => {
    expect(resolveAutomaticMonth(new Set(['2026-11-01']), WINDOW.minDateStr, WINDOW.maxDateStr, october))
      .toEqual({ year: 2026, month: 10 })
  })

  it('stays on the current month when nothing is bookable', () => {
    expect(resolveAutomaticMonth(new Set(), WINDOW.minDateStr, WINDOW.maxDateStr, november))
      .toEqual({ year: 2026, month: 10 })
  })
})

describe('CalendarGrid month navigation', () => {
  it('A. keeps the current month when it contains slots', () => {
    const ui = renderGrid({
      ...WINDOW,
      referenceDate: november,
      availableDateSet: new Set(['2026-10-31', '2026-11-01']),
    })
    expect(ui.month()).toBe('2026-11')
    expect(ui.cells()).toEqual(['date-cell-2026-11-01'])
    ui.unmount()
  })

  it('B. opens the first slotted month when the current month is empty', () => {
    const ui = renderGrid({
      ...WINDOW,
      referenceDate: october,
      availableDateSet: new Set(['2026-11-01']),
    })
    expect(ui.month()).toBe('2026-11')
    expect(ui.cells()).toContain('date-cell-2026-11-01')
    ui.unmount()
  })

  it('C/D/E. manual empty month survives rerender and a new availability set', () => {
    const props = {
      ...WINDOW,
      referenceDate: october,
      availableDateSet: new Set(['2026-11-01']),
      viewResetKey: 'master-a:2',
    }
    const ui = renderGrid(props)
    ui.click('month-prev')
    expect(ui.month()).toBe('2026-10')
    expect(ui.cells()).toEqual([])

    ui.rerender(props)
    expect(ui.month()).toBe('2026-10')

    ui.rerender({
      ...props,
      availableDateSet: new Set(['2026-11-01', '2026-11-02']),
    })
    expect(ui.month()).toBe('2026-10')
    expect(ui.cells()).toEqual([])
    ui.unmount()
  })

  it('F. a new master or service reinitializes the month', () => {
    const ui = renderGrid({
      ...WINDOW,
      referenceDate: october,
      availableDateSet: new Set(['2026-11-01']),
      viewResetKey: 'master-a:1',
    })
    ui.click('month-prev')
    expect(ui.month()).toBe('2026-10')
    ui.rerender({
      ...WINDOW,
      referenceDate: october,
      availableDateSet: new Set(['2026-11-01']),
      viewResetKey: 'master-b:9',
    })
    expect(ui.month()).toBe('2026-11')
    ui.unmount()
  })

  it('G/H/I. an incompatible manual month is cleared and does not return when the window expands', () => {
    const ui = renderGrid({
      ...WINDOW,
      referenceDate: october,
      availableDateSet: new Set(['2026-11-01']),
    })
    ui.click('month-prev')
    expect(ui.month()).toBe('2026-10')
    ui.rerender({
      referenceDate: october,
      minDateStr: '2026-11-01',
      maxDateStr: '2026-11-14',
      availableDateSet: new Set(['2026-11-01']),
    })
    expect(ui.month()).toBe('2026-11')
    ui.rerender({
      ...WINDOW,
      referenceDate: october,
      availableDateSet: new Set(['2026-11-01']),
    })
    expect(ui.month()).toBe('2026-11')
    expect(ui.cells()).toEqual(['date-cell-2026-11-01'])
    ui.rerender({
      ...WINDOW,
      referenceDate: october,
      availableDateSet: new Set(['2026-11-01', '2026-11-02']),
    })
    expect(ui.month()).toBe('2026-11')
    ui.unmount()
  })

  it('H. December navigation stays on the empty year-boundary month', () => {
    const ui = renderGrid({
      referenceDate: new Date(2026, 11, 31),
      minDateStr: '2026-12-20',
      maxDateStr: '2027-01-15',
      availableDateSet: new Set(['2027-01-03']),
    })
    expect(ui.month()).toBe('2027-01')
    expect(ui.cells()).toEqual(['date-cell-2027-01-03'])
    ui.click('month-prev')
    expect(ui.month()).toBe('2026-12')
    expect(ui.cells()).toEqual([])
    ui.click('month-next')
    expect(ui.month()).toBe('2027-01')
    ui.unmount()
  })

  it('I. no slots leave the current month without date cells, and the wizard keeps its empty state', () => {
    const ui = renderGrid({
      ...WINDOW,
      referenceDate: november,
      availableDateSet: new Set(),
    })
    expect(ui.month()).toBe('2026-11')
    expect(ui.cells()).toEqual([])
    ui.unmount()
    const wizard = readFileSync('src/components/booking/PublicBookingWizard.jsx', 'utf8')
    expect(wizard).toContain('data-testid="date-empty-state"')
    expect(wizard.indexOf('dateOptions.length === 0')).toBeLessThan(wizard.indexOf('<CalendarGrid'))
  })

  it('J. slots that arrive after the first paint choose the month once', () => {
    const ui = renderGrid({
      ...WINDOW,
      referenceDate: october,
      availableDateSet: new Set(),
    })
    expect(ui.month()).toBe('2026-10')
    ui.rerender({
      ...WINDOW,
      referenceDate: october,
      availableDateSet: new Set(['2026-11-01']),
    })
    expect(ui.month()).toBe('2026-11')
    expect(ui.cells()).toContain('date-cell-2026-11-01')
    ui.unmount()
  })

  it('K. repeat booking keeps a manual month when the same booking reloads slots', () => {
    const changes = []
    const ui = renderGrid({
      ...WINDOW,
      referenceDate: october,
      availableDateSet: new Set(['2026-11-01']),
      viewResetKey: 'booking-7',
      onMonthChange: (month) => changes.push(month),
    })
    ui.click('month-prev')
    expect(changes).toEqual([{ year: 2026, month: 9 }])
    ui.rerender({
      ...WINDOW,
      referenceDate: october,
      availableDateSet: new Set(['2026-11-02']),
      viewResetKey: 'booking-7',
      onMonthChange: (month) => changes.push(month),
    })
    expect(ui.month()).toBe('2026-10')
    expect(changes).toEqual([{ year: 2026, month: 9 }])
    ui.unmount()
  })

  it('uses the browser-local month of one instant in UTC and Europe/Moscow', () => {
    const instant = new Date('2026-10-31T21:30:00.000Z')
    const slots = new Set(['2026-10-31', '2026-11-01'])
    const ui = renderGrid({
      ...WINDOW,
      referenceDate: instant,
      availableDateSet: slots,
    })
    const local = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}`
    expect(['2026-10', '2026-11']).toContain(local)
    expect(ui.month()).toBe(local)
    ui.unmount()
  })
})
