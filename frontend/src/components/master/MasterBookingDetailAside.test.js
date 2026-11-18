/**
 * @vitest-environment happy-dom
 */
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountDom } from '../../test/domHarness'
import MasterBookingDetailAside from './MasterBookingDetailAside'
import MasterScheduleDayCompact from './MasterScheduleDayCompact'
import MasterScheduleDayDetailAside from './MasterScheduleDayDetailAside'

vi.mock('../../utils/api', () => ({
  apiGet: vi.fn(async () => ({ items: [] })),
}))

const onlineBooking = {
  id: 501,
  source: 'online',
  status: 'awaiting_confirmation',
  service_name: 'Стрижка',
  client_name: 'Иван',
  start_time: '2026-11-04T10:00:00',
  end_time: '2026-11-04T10:30:00',
}

function startSelect(container) {
  return [...container.querySelectorAll('select')].find((el) => el.closest('label')?.textContent?.includes('Начало'))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('MasterBookingDetailAside actions', () => {
  it('passes booking id to confirm and cancel handlers', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const ui = mountDom()
    await ui.render(createElement(MasterBookingDetailAside, {
      booking: onlineBooking,
      master: { can_auto_confirm: true },
      hasExtendedStats: true,
      onClose() {},
      onConfirm,
      onCancelRequest: onCancel,
    }))
    await ui.click('Подтвердить запись')
    expect(onConfirm).toHaveBeenCalledWith(501, onlineBooking)
    await ui.click('Отменить запись')
    expect(onCancel).toHaveBeenCalledWith(501)
    await ui.unmount()
  })

  it('hides confirm when permissions disallow it', async () => {
    const ui = mountDom()
    await ui.render(createElement(MasterBookingDetailAside, {
      booking: { ...onlineBooking, status: 'completed' },
      master: {},
      hasExtendedStats: false,
      onClose() {},
    }))
    expect(ui.container.textContent).not.toContain('Подтвердить запись')
    await ui.unmount()
  })
})

describe('Day calendar selection and agenda', () => {
  it('day agenda lists only real events without synthetic gaps', async () => {
    const bookings = [
      {
        id: 1,
        source: 'online',
        status: 'confirmed',
        start_time: '2026-11-04T10:00:00',
        end_time: '2026-11-04T11:00:00',
        service_name: 'A',
      },
      {
        id: 2,
        source: 'online',
        status: 'confirmed',
        start_time: '2026-11-04T12:00:00',
        end_time: '2026-11-04T13:00:00',
        service_name: 'B',
      },
    ]
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleDayCompact, {
      date: new Date(2026, 10, 4),
      schedule: {},
      bookings,
      blocks: [],
      selection: null,
      onSelect() {},
      timeZone: 'Europe/Moscow',
      master: null,
      hasExtendedStats: false,
    }))
    const agenda = ui.container.querySelector('[data-testid="master-day-agenda"]')
    expect(agenda.textContent).toContain('A')
    expect(agenda.textContent).toContain('B')
    expect(agenda.textContent).not.toMatch(/Промежуток|не подтверждает доступность/i)
    expect(agenda.textContent).not.toContain('Свободно')
    await ui.unmount()
  })

  it('createPrefill mode switches form and can be re-applied', async () => {
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleDayDetailAside, {
      selection: null,
      focusDate: new Date(2026, 10, 4),
      timeZone: 'Europe/Moscow',
      bookings: [],
      blocks: [],
      master: null,
      hasExtendedStats: false,
      onClearSelection() {},
      createPrefill: { mode: 'manual', dateStr: '2026-11-04', commandId: 1 },
    }))
    expect(ui.container.textContent).toContain('Запись вручную')
    await ui.click('Личное событие')
    expect(ui.container.textContent).toContain('Категория')
    await ui.render(createElement(MasterScheduleDayDetailAside, {
      selection: null,
      focusDate: new Date(2026, 10, 4),
      timeZone: 'Europe/Moscow',
      bookings: [],
      blocks: [],
      master: null,
      hasExtendedStats: false,
      onClearSelection() {},
      createPrefill: { mode: 'manual', dateStr: '2026-11-04', startIso: '2026-11-04T15:30:00', commandId: 2 },
    }))
    expect(ui.container.textContent).toContain('Запись вручную')
    await ui.unmount()
  })

  it('re-applies same createPrefill command after manual type switch', async () => {
    const baseAside = {
      selection: null,
      focusDate: new Date(2026, 10, 4),
      timeZone: 'Europe/Moscow',
      bookings: [],
      blocks: [],
      master: null,
      hasExtendedStats: false,
      onClearSelection() {},
      createPrefill: {
        mode: 'manual',
        dateStr: '2026-11-04',
        startIso: '2026-11-04T15:30:00',
        commandId: 1,
      },
    }
    const ui = mountDom()
    await ui.render(createElement(MasterScheduleDayDetailAside, baseAside))
    expect(startSelect(ui.container)?.value).toBe('15:30')
    await ui.click('Личное событие')
    expect(ui.container.textContent).toContain('Категория')
    await ui.render(createElement(MasterScheduleDayDetailAside, {
      ...baseAside,
      createPrefill: { ...baseAside.createPrefill, commandId: 2 },
    }))
    expect(ui.container.textContent).toContain('Запись вручную')
    expect(startSelect(ui.container)?.value).toBe('15:30')
    await ui.unmount()
  })
})