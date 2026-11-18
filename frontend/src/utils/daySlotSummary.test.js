import { describe, expect, it } from 'vitest'
import { eventOutsideWorkingHours, summarizeDaySlots, weekColumnHoursLabel } from './daySlotSummary'

describe('daySlotSummary', () => {
  it('weekColumnHoursLabel uses schedule map', () => {
    const schedule = {
      '2026-10-27_9_0': { is_working: true },
      '2026-10-27_17_30': { is_working: true },
    }
    expect(weekColumnHoursLabel(schedule, '2026-10-27')).toBe('09:00–18:00')
    expect(weekColumnHoursLabel(schedule, '2026-11-01')).toBe('Выходной')
  })

  const schedule = {
    '2026-11-04_10_0': { is_working: true },
    '2026-11-04_10_30': { is_working: true },
    '2026-11-04_19_30': { is_working: true },
  }

  it('detects events outside merged working hours', () => {
    expect(
      eventOutsideWorkingHours('2026-11-04T20:05:00', '2026-11-04T20:35:00', '2026-11-04', schedule),
    ).toBe(true)
    expect(
      eventOutsideWorkingHours('2026-11-04T16:05:00', '2026-11-04T16:35:00', '2026-11-04', schedule),
    ).toBe(true)
  })

  it('does not treat open grid count as client availability', () => {
    const summary = summarizeDaySlots({
      dateStr: '2026-11-04',
      slotsForDay: [{ hour: 10, minute: 0, is_working: true }],
      bookings: [{ id: 1, start_time: '2026-11-04T16:05:00', end_time: '2026-11-04T16:35:00', status: 'confirmed' }],
      blocks: [],
      schedule,
    })
    expect(summary.hasAuthoritativeClientAvailability).toBe(false)
    expect(summary.openGridCount).toBe(1)
    expect(summary.outOfHours.length).toBeGreaterThan(0)
  })
})
