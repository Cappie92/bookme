import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  calendarDateFromValue,
  editedScheduleDays,
  formatCalendarDateDisplay,
  formatLocalDate,
  localCalendarDateStringsForMonth,
  localizeScheduleError,
  rescheduleAvailabilityQuery,
  rescheduleCalendarDate,
  rescheduleSlotsHeading,
  timeEditAvailableDateSet,
} from './scheduleDates'
import { getWeekDates } from './calendarUtils'

afterEach(() => vi.useRealTimers())
describe('calendar date contract (run under UTC and Europe/Moscow)', () => {
  it.each([0, 1, 2, 3, 4, 5, 6])('keeps weekday index %s at local midnight', index => {
    const day = new Date(2026, 8, 7 + index, 0, 15)
    expect(formatLocalDate(day)).toBe(`2026-09-${String(7 + index).padStart(2, '0')}`)
    expect((day.getDay() + 6) % 7).toBe(index)
  })
  it.each([6, 7, 11, 13, 14])('Monday/Sunday boundary on September %s', day => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, day, 0, 15))
    const week = getWeekDates(0).map(d => formatLocalDate(d.date))
    expect(week[0]).toBe(day === 6 ? '2026-08-31' : day === 14 ? '2026-09-14' : '2026-09-07')
  })
  it('editing Friday 11 never submits Sunday 6 or unedited past days', () => {
    const schedule = { '2026-09-07_9_0': true, '2026-09-11_8_0': { is_working: true } }
    expect(editedScheduleDays(schedule, { '2026-09-11_9_30': true })).toEqual([{
      schedule_date: '2026-09-11',
      open_slots: [{ hour: 8, minute: 0 }, { hour: 9, minute: 30 }],
    }])
    expect(editedScheduleDays(schedule, { '2026-09-11_8_0': false })[0].open_slots).toEqual([])
  })
  it('localizes visible error dates without changing API keys', () => {
    expect(localizeScheduleError('Дата 2026-09-06 уже прошла.')).toBe('Дата 06.09.2026 уже прошла.')
  })
})

describe('reschedule date-only contract', () => {
  it('opens time edit from booking datetime as YYYY-MM-DD', () => {
    const booking = { date: '2026-09-26T12:00:00', start_time: '2026-09-26T12:00:00' }
    expect(rescheduleCalendarDate(booking)).toBe('2026-09-26')
    expect(calendarDateFromValue(booking.date)).toBe('2026-09-26')
  })

  it('prefers start_time over date when both exist', () => {
    expect(rescheduleCalendarDate({
      date: '2026-09-25T12:00:00',
      start_time: '2026-09-26T12:00:00',
    })).toBe('2026-09-26')
  })

  it('requests available-slots with date-only, never ISO datetime', () => {
    expect(rescheduleAvailabilityQuery('2026-09-26T12:00:00')).toBe('date=2026-09-26')
    expect(rescheduleAvailabilityQuery('2026-09-26')).toBe('date=2026-09-26')
  })

  it('formats the slots heading as DD.MM.YY without ISO', () => {
    expect(rescheduleSlotsHeading('2026-09-26T12:00:00')).toBe('Доступные слоты на 26.09.26')
    expect(formatCalendarDateDisplay('2026-09-26')).toBe('26.09.26')
  })

  it('keeps Saturday 26.09.2026 selectable when backend has slots', () => {
    const set = timeEditAvailableDateSet({
      '2026-09-25': true,
      '2026-09-26': true,
      '2026-09-27': true,
    }, '2026-09-22')
    expect(set.has('2026-09-26')).toBe(true)
    expect(set.has('2026-09-27')).toBe(true)
  })

  it('does not drop weekends and does not keep past days', () => {
    const set = timeEditAvailableDateSet({
      '2026-09-21': true,
      '2026-09-26': true,
    }, '2026-09-22')
    expect(set.has('2026-09-21')).toBe(false)
    expect(set.has('2026-09-26')).toBe(true)
  })

  it('month availability keys stay on the local calendar, not UTC', () => {
    const september = localCalendarDateStringsForMonth(2026, 8)
    expect(september[0]).toBe('2026-09-01')
    expect(september[25]).toBe('2026-09-26')
    expect(september[september.length - 1]).toBe('2026-09-30')
    expect(september).toHaveLength(30)
    expect(september.some((d) => d.startsWith('2026-08'))).toBe(false)
    expect(september.some((d) => d.startsWith('2026-10'))).toBe(false)
  })

  it('does not shift date-only midnight across month boundary', () => {
    expect(calendarDateFromValue('2026-10-01T00:00:00')).toBe('2026-10-01')
    expect(formatCalendarDateDisplay('2026-10-01T00:00:00')).toBe('01.10.26')
    expect(calendarDateFromValue(new Date(2026, 9, 1, 0, 0, 0))).toBe('2026-10-01')
  })
})
