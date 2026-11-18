/**
 * @vitest-environment happy-dom
 */
import { createElement, act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountDom } from '../../test/domHarness'
import { CalendarB3ComposerForm } from './CalendarB3Composer'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  createManualBooking: vi.fn(),
  updateManualBooking: vi.fn(),
}))

vi.mock('../../utils/api', () => ({
  apiGet: (...args) => mocks.apiGet(...args),
}))

vi.mock('../../utils/calendarB3', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createManualBooking: (...args) => mocks.createManualBooking(...args),
    updateManualBooking: (...args) => mocks.updateManualBooking(...args),
  }
})

const bookings = [{
  id: 9,
  status: 'awaiting_confirmation',
  start_time: '2026-11-04T16:00:00',
  end_time: '2026-11-04T17:00:00',
}]

function startSelect(container) {
  return [...container.querySelectorAll('select')].find((el) => el.closest('label')?.textContent?.includes('Начало'))
}

function durationSelect(container) {
  return [...container.querySelectorAll('select')].find((el) => el.closest('label')?.textContent?.includes('Длительность'))
}

function serviceSelect(container) {
  return [...container.querySelectorAll('select')].find((el) => el.closest('label')?.textContent?.includes('Услуга'))
}

async function setSelect(el, value) {
  await act(async () => {
    el.value = value
    el.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
  })
}

async function setInputValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
  })
}

async function setDateInput(container, value) {
  const dateInput = container.querySelector('input[type="date"]')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(dateInput, value)
    dateInput.dispatchEvent(new Event('input', { bubbles: true }))
    dateInput.dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
  })
}

beforeEach(() => {
  mocks.apiGet.mockResolvedValue([
    { service_id: 5, name: 'Стрижка', duration: 30 },
  ])
  mocks.createManualBooking.mockResolvedValue({ id: 100, version: 1 })
  mocks.updateManualBooking.mockResolvedValue({ id: 9, version: 2 })
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('CalendarB3Composer manual time selection', () => {
  const baseProps = {
    mode: 'manual',
    event: null,
    dateStr: '2026-11-04',
    timeZone: 'Europe/Moscow',
    bookings,
    blocks: [],
    onClose() {},
    onSaved() {},
    variant: 'inline',
  }

  it('does not default new manual booking to 10:00', async () => {
    const ui = mountDom()
    await ui.render(createElement(CalendarB3ComposerForm, baseProps))
    expect(startSelect(ui.container)?.value).toBe('')
    await ui.unmount()
  })

  it('shows subtitle from startDate when date input changes', async () => {
    const ui = mountDom()
    await ui.render(createElement(CalendarB3ComposerForm, baseProps))
    await setDateInput(ui.container, '2026-11-05')
    expect(ui.container.textContent).toContain('2026-11-05 · время мастера')
    await ui.unmount()
  })

  it('requires explicit start time and blocks create API', async () => {
    const ui = mountDom()
    await ui.render(createElement(CalendarB3ComposerForm, baseProps))
    const start = startSelect(ui.container)
    expect(start.options[0].value).toBe('')
    await setSelect(durationSelect(ui.container), '60')
    await ui.click('Сохранить')
    expect(ui.container.textContent).toContain('Выберите время начала.')
    expect(mocks.createManualBooking).not.toHaveBeenCalled()
    await ui.unmount()
  })

  it('clears free start after occupancy rerender without auto-picking another slot', async () => {
    const ui = mountDom()
    await ui.render(createElement(CalendarB3ComposerForm, baseProps))
    await setSelect(durationSelect(ui.container), '30')
    const start = startSelect(ui.container)
    const free = [...start.options].find((opt) => opt.value && !opt.disabled)
    await setSelect(start, free.value)
    expect(start.value).toBe(free.value)
    await ui.render(createElement(CalendarB3ComposerForm, {
      ...baseProps,
      bookings: [
        ...bookings,
        {
          id: 88,
          status: 'confirmed',
          start_time: `2026-11-04T${free.value}:00`,
          end_time: `2026-11-04T${free.value}:30`,
        },
      ],
    }))
    expect(startSelect(ui.container)?.value).toBe('')
    await ui.unmount()
  })

  it('clears start when longer duration introduces overlap', async () => {
    const ui = mountDom()
    await ui.render(createElement(CalendarB3ComposerForm, baseProps))
    await setSelect(durationSelect(ui.container), '60')
    await setSelect(startSelect(ui.container), '15:00')
    await setSelect(durationSelect(ui.container), '120')
    expect(startSelect(ui.container)?.value).toBe('')
    await ui.unmount()
  })

  it('creates manual booking with explicit time after valid input', async () => {
    const onSaved = vi.fn()
    const ui = mountDom()
    await ui.render(createElement(CalendarB3ComposerForm, { ...baseProps, onSaved }))
    const nameInput = [...ui.container.querySelectorAll('label')].find((l) => l.textContent?.includes('Имя клиента'))?.querySelector('input')
    await setInputValue(nameInput, 'Тестовый клиент')
    await setSelect(durationSelect(ui.container), '30')
    await setSelect(startSelect(ui.container), '12:00')
    await ui.click('Сохранить')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(mocks.createManualBooking).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalled()
    await ui.unmount()
  })

  it('prefill without id keeps explicit start from grid click', async () => {
    const ui = mountDom()
    await ui.render(createElement(CalendarB3ComposerForm, {
      ...baseProps,
      event: { start_time: '2026-11-04T15:30:00' },
    }))
    expect(startSelect(ui.container)?.value).toBe('15:30')
    await ui.unmount()
  })

  it('editing off-grid stored event does not offer off-grid start options', async () => {
    const ui = mountDom()
    await ui.render(createElement(CalendarB3ComposerForm, {
      ...baseProps,
      event: {
        id: 9,
        source: 'manual',
        guest_name: 'Клиент',
        start_time: '2026-11-04T16:23:46',
        end_time: '2026-11-04T16:53:46',
        version: 3,
      },
    }))
    const start = startSelect(ui.container)
    expect([...start.options].some((opt) => opt.value === '16:23')).toBe(false)
    await ui.unmount()
  })

  it('block create validates empty start without breaking layout', async () => {
    const ui = mountDom()
    await ui.render(createElement(CalendarB3ComposerForm, {
      ...baseProps,
      mode: 'block',
    }))
    expect(ui.container.textContent).toContain('Личное событие')
    await ui.click('Сохранить')
    expect(ui.container.textContent).toContain('Выберите время начала.')
    await ui.unmount()
  })

  it('clears start when switching short service to longer one that overlaps', async () => {
    mocks.apiGet.mockResolvedValue([
      { service_id: 5, name: 'Короткая', duration: 30 },
      { service_id: 6, name: 'Длинная', duration: 120 },
    ])
    const busyFrom1600 = [{
      id: 99,
      status: 'confirmed',
      start_time: '2026-11-04T16:00:00',
      end_time: '2026-11-04T16:30:00',
    }]
    const ui = mountDom()
    await ui.render(createElement(CalendarB3ComposerForm, { ...baseProps, bookings: busyFrom1600 }))
    await act(async () => { await Promise.resolve() })
    await setSelect(serviceSelect(ui.container), 'service:5')
    await setSelect(startSelect(ui.container), '15:30')
    await setSelect(serviceSelect(ui.container), 'service:6')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(startSelect(ui.container)?.value).toBe('')
    await ui.unmount()
  })

  it('updates manual booking through mocked API', async () => {
    const onSaved = vi.fn()
    const ui = mountDom()
    await ui.render(createElement(CalendarB3ComposerForm, {
      ...baseProps,
      event: {
        id: 9,
        source: 'manual',
        guest_name: 'Клиент',
        start_time: bookings[0].start_time,
        end_time: bookings[0].end_time,
        version: 3,
      },
      onSaved,
    }))
    await setInputValue(
      [...ui.container.querySelectorAll('label')].find((l) => l.textContent?.includes('Имя клиента'))?.querySelector('input'),
      'Обновлённый',
    )
    await ui.click('Сохранить')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(mocks.updateManualBooking).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalled()
    await ui.unmount()
  })

  it('type switch callback fires from allowTypeSwitch', async () => {
    const onTypeChange = vi.fn()
    const ui = mountDom()
    await ui.render(createElement(CalendarB3ComposerForm, {
      ...baseProps,
      allowTypeSwitch: true,
      onTypeChange,
    }))
    await ui.click('Личное событие')
    expect(onTypeChange).toHaveBeenCalledWith('block')
    await ui.unmount()
  })
})