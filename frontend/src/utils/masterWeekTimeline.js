/** Week timeline layout (Figma 88:3018) — 30-minute grid, continuous event blocks. */

export const WEEK_TIMELINE_ROW_HEIGHT_PX = 24
export const WEEK_MINUTES_STEP = 30
export const WEEK_SLOTS_PER_DAY = (24 * 60) / WEEK_MINUTES_STEP

export function minuteToTimelinePx(minute) {
  return (minute / WEEK_MINUTES_STEP) * WEEK_TIMELINE_ROW_HEIGHT_PX
}

export function timelineDurationPx(startMinute, endMinute) {
  const span = Math.max(WEEK_MINUTES_STEP, endMinute - startMinute)
  return (span / WEEK_MINUTES_STEP) * WEEK_TIMELINE_ROW_HEIGHT_PX
}

/** Two Grid text lines need > one slot row; 30-min tiles use compact (icon + time only). */
export const WEEK_GRID_COMPACT_MAX_HEIGHT_PX = WEEK_TIMELINE_ROW_HEIGHT_PX + 16

export function weekGridVariantFromHeight(heightPx) {
  return heightPx < WEEK_GRID_COMPACT_MAX_HEIGHT_PX ? 'compact' : 'standard'
}

export function timeIndexFromParts(hour, minute) {
  return hour * 2 + (minute >= 30 ? 1 : 0)
}

/**
 * Greedy lane assignment for overlapping intervals (display only).
 */
export function layoutOverlappingLanes(items) {
  const sorted = [...items].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute)
  const laneEnds = []
  const placed = sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.startMinute)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(0)
    }
    laneEnds[lane] = item.endMinute
    return { ...item, lane }
  })
  const laneCount = Math.max(1, laneEnds.length)
  return placed.map((item) => ({ ...item, laneCount }))
}
