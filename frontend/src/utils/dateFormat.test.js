import { describe, it, expect } from 'vitest'
import { formatTimeShort } from './dateFormat'

describe('formatTimeShort shows the master wall time regardless of the browser zone', () => {
  it.each([
    ['2030-07-01T09:30:00', '09:30'],
    ['2030-07-01T09:30', '09:30'],
    ['2030-07-01 09:30:00', '09:30'],
    ['2030-07-01T09:30:00+03:00', '09:30'],
    ['2030-07-01T09:30:00-04:00', '09:30'],
    ['2030-07-01T23:30:00+05:30', '23:30'],
  ])('%s -> %s', (value, expected) => {
    expect(formatTimeShort(value)).toBe(expected)
  })

  it('keeps empty and invalid values safe', () => {
    expect(formatTimeShort('')).toBe('')
    expect(formatTimeShort(null)).toBe('')
    expect(formatTimeShort('not a date')).toBe('')
  })
})
