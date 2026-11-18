import { describe, expect, it } from 'vitest'
import {
  isStartOnScheduleGrid,
  scheduleGridStartError,
  scheduleGridTimeOptions,
} from './calendarTimeGrid'

describe('calendarTimeGrid', () => {
  it('accepts :00 and :30 starts only', () => {
    expect(isStartOnScheduleGrid('10:00')).toBe(true)
    expect(isStartOnScheduleGrid('16:30')).toBe(true)
    expect(isStartOnScheduleGrid('16:05')).toBe(false)
  })

  it('rejects off-grid starts without legacy exemption', () => {
    expect(scheduleGridStartError('16:05')).toMatch(/:00/)
    expect(scheduleGridStartError('16:30')).toBeNull()
  })

  it('generates 48 starts per day', () => {
    expect(scheduleGridTimeOptions()).toHaveLength(48)
  })
})