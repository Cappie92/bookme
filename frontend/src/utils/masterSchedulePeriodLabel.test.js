import { describe, expect, it } from 'vitest'
import { formatMasterSchedulePeriodLabel } from './masterSchedulePeriodLabel'

describe('formatMasterSchedulePeriodLabel', () => {
  it('formats same-month week without year suffix on each day', () => {
    const weekDates = Array.from({ length: 7 }, (_, i) => ({
      date: new Date(2026, 10, 16 + i),
    }))
    expect(formatMasterSchedulePeriodLabel('week', new Date(), weekDates)).toBe('16–22 ноября 2026')
  })

  it('formats cross-month week in one year', () => {
    const weekDates = Array.from({ length: 7 }, (_, i) => ({
      date: new Date(2026, 10, 28 + i),
    }))
    expect(formatMasterSchedulePeriodLabel('week', new Date(), weekDates)).toMatch(/28 ноября – .* декабря 2026/)
  })

  it('formats day mode with weekday', () => {
    const day = new Date(2026, 10, 16)
    const label = formatMasterSchedulePeriodLabel('day', day, [])
    expect(label).toContain('понедельник')
    expect(label).toContain('16')
    expect(label).toContain('ноября')
    expect(label).toContain('2026')
  })
})