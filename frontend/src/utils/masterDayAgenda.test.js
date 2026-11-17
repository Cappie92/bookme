import { describe, expect, it } from 'vitest'
import {
  MASTER_DAY_AGENDA_SKIPS_CLIENT_AVAILABILITY,
  buildMasterDayAgenda,
  workingIntervalsForDay,
} from './masterDayAgenda'

describe('masterDayAgenda safety', () => {
  it('documents that client availability is not rendered in day agenda', () => {
    expect(MASTER_DAY_AGENDA_SKIPS_CLIENT_AVAILABILITY).toBe(true)
  })

  it('merges adjacent working slots (editor map only)', () => {
    const schedule = {
      '2026-11-04_10_0': { is_working: true },
      '2026-11-04_10_30': { is_working: true },
    }
    expect(workingIntervalsForDay(schedule, '2026-11-04')).toEqual([{ start: 600, end: 660 }])
  })

  it('never emits available/bookable rows even when weekly schedule has gaps', () => {
    const schedule = {
      '2026-11-04_10_0': { is_working: true },
      '2026-11-04_10_30': { is_working: true },
      '2026-11-04_11_0': { is_working: true },
      '2026-11-04_11_30': { is_working: true },
    }
    const bookings = [
      {
        id: 1,
        source: 'online',
        service_name: 'Стрижка',
        guest_name: 'Anna',
        start_time: '2026-11-04T10:30:00',
        end_time: '2026-11-04T11:00:00',
      },
    ]
    const result = buildMasterDayAgenda({
      date: new Date('2026-11-04T12:00:00'),
      schedule,
      bookings,
      blocks: [],
    })
    expect(result.emitsClientAvailability).toBe(false)
    expect(result.rows.every((r) => r.type === 'event')).toBe(true)
    expect(result.rows.some((r) => r.type === 'available')).toBe(false)
    expect(JSON.stringify(result.rows)).not.toMatch(/Свободно|Доступно/i)
  })

  it('lists events without schedule data', () => {
    const bookings = [
      {
        id: 2,
        source: 'manual',
        service_name: 'Услуга',
        client_name: 'Bob',
        start_time: '2026-11-04T14:00:00',
        end_time: '2026-11-04T15:00:00',
      },
    ]
    const result = buildMasterDayAgenda({
      date: new Date('2026-11-04T12:00:00'),
      schedule: {},
      bookings,
      blocks: [],
    })
    expect(result.hasWeeklyWorkingSlots).toBe(false)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].kind).toBe('booking')
  })

  it('does not synthesize neutral gap rows between events', () => {
    const bookings = [
      {
        id: 1,
        source: 'manual',
        service_name: 'A',
        client_name: 'One',
        start_time: '2026-11-04T10:00:00',
        end_time: '2026-11-04T10:30:00',
      },
      {
        id: 2,
        source: 'online',
        service_name: 'B',
        guest_name: 'Two',
        start_time: '2026-11-04T11:00:00',
        end_time: '2026-11-04T11:30:00',
      },
    ]
    const result = buildMasterDayAgenda({
      date: new Date('2026-11-04T12:00:00'),
      schedule: {},
      bookings,
      blocks: [],
    })
    expect(result.rows.filter((r) => r.type === 'neutral')).toHaveLength(0)
    expect(result.rows).toHaveLength(2)
  })
})
