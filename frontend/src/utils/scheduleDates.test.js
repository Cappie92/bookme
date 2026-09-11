import { describe, it, expect, vi, afterEach } from 'vitest'
import { editedScheduleDays, formatLocalDate, localizeScheduleError } from './scheduleDates'
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
