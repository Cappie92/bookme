import { describe, expect, it } from 'vitest'
import { formatWallTime } from './dateFormat'

describe('formatWallTime', () => {
  it('reads HH:MM from fractional naive backend timestamps', () => {
    expect(formatWallTime('2026-11-04T16:23:46.313500')).toBe('16:23')
    expect(formatWallTime('2026-11-04 16:23:46.313500')).toBe('16:23')
  })
})
