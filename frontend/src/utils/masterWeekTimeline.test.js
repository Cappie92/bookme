import { describe, expect, it } from 'vitest'
import {
  layoutOverlappingLanes,
  minuteToTimelinePx,
  timelineDurationPx,
  weekGridVariantFromHeight,
  WEEK_GRID_COMPACT_MAX_HEIGHT_PX,
  WEEK_TIMELINE_ROW_HEIGHT_PX,
} from './masterWeekTimeline'

describe('masterWeekTimeline', () => {
  it('maps minutes to px preserving duration (90 min → 3 rows)', () => {
    expect(minuteToTimelinePx(60)).toBe(2 * WEEK_TIMELINE_ROW_HEIGHT_PX)
    expect(timelineDurationPx(60, 150)).toBe(3 * WEEK_TIMELINE_ROW_HEIGHT_PX)
  })

  it('assigns lanes for overlaps without changing start/end', () => {
    const laid = layoutOverlappingLanes([
      { id: 1, startMinute: 600, endMinute: 690 },
      { id: 2, startMinute: 630, endMinute: 720 },
      { id: 3, startMinute: 800, endMinute: 830 },
    ])
    expect(laid.find((r) => r.id === 1)?.startMinute).toBe(600)
    expect(laid.find((r) => r.id === 2)?.lane).toBe(1)
    expect(laid.find((r) => r.id === 3)?.lane).toBe(0)
    expect(laid[0].laneCount).toBeGreaterThanOrEqual(2)
  })

  it('picks compact grid variant only for single-slot height', () => {
    expect(weekGridVariantFromHeight(WEEK_TIMELINE_ROW_HEIGHT_PX)).toBe('compact')
    expect(weekGridVariantFromHeight(WEEK_GRID_COMPACT_MAX_HEIGHT_PX - 1)).toBe('compact')
    expect(weekGridVariantFromHeight(2 * WEEK_TIMELINE_ROW_HEIGHT_PX)).toBe('standard')
  })
})
