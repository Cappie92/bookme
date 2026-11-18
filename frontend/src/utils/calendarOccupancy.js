import {
  findOverlap,
  intervalForService,
  intervalFromClocks,
} from './calendarB3'
import { scheduleGridTimeOptions } from './calendarTimeGrid'

const BLOCK_MIN_MINUTES = 30

function ignoreForEdit(editing, mode, event) {
  if (!editing || !event?.id) return null
  return { kind: mode === 'manual' ? 'booking' : 'block', id: event.id }
}

export function manualCandidateInterval(dateStr, startTime, durationMinutes) {
  if (!dateStr || !startTime || !durationMinutes) return null
  return intervalForService(dateStr, startTime, durationMinutes)
}

export function blockCandidateInterval(startDate, startTime, endDate, endTime) {
  if (!startDate || !startTime || !endDate || !endTime) return null
  return intervalFromClocks(startDate, startTime, endTime, endDate)
}

export function isManualStartOccupied({
  dateStr,
  startTime,
  durationMinutes,
  bookings,
  blocks,
  editing,
  event,
}) {
  const interval = manualCandidateInterval(dateStr, startTime, durationMinutes)
  if (!interval?.start_time || !interval?.end_time) return false
  return Boolean(findOverlap(interval, bookings, blocks, ignoreForEdit(editing, 'manual', event)))
}

export function isBlockIntervalOccupied({
  startDate,
  startTime,
  endDate,
  endTime,
  bookings,
  blocks,
  editing,
  event,
}) {
  const interval = blockCandidateInterval(startDate, startTime, endDate, endTime)
  if (!interval?.start_time || !interval?.end_time) return false
  return Boolean(findOverlap(interval, bookings, blocks, ignoreForEdit(editing, 'block', event)))
}

export function annotateManualStartOptions({
  dateStr,
  durationMinutes,
  bookings,
  blocks,
  editing,
  event,
}) {
  const options = scheduleGridTimeOptions()
  return options.map((row) => {
    if (!durationMinutes) {
      return { ...row, disabled: true, busy: false, reason: 'duration' }
    }
    const busy = isManualStartOccupied({
      dateStr,
      startTime: row.value,
      durationMinutes,
      bookings,
      blocks,
      editing,
      event,
    })
    return {
      ...row,
      disabled: busy,
      busy,
      reason: busy ? 'overlap' : null,
    }
  })
}

export function annotateBlockStartOptions({
  startDate,
  endDate,
  endTime,
  bookings,
  blocks,
  editing,
  event,
}) {
  const options = scheduleGridTimeOptions()
  return options.map((row) => {
    if (!endTime || !endDate) {
      return { ...row, disabled: false, busy: false }
    }
    const busy = isBlockIntervalOccupied({
      startDate,
      startTime: row.value,
      endDate,
      endTime,
      bookings,
      blocks,
      editing,
      event,
    })
    return { ...row, disabled: busy, busy, reason: busy ? 'overlap' : null }
  })
}

export function annotateBlockEndOptions({
  startDate,
  startTime,
  endDate,
  bookings,
  blocks,
  editing,
  event,
}) {
  const options = scheduleGridTimeOptions()
  return options.map((row) => {
    if (!startTime || !startDate) {
      return { ...row, disabled: false, busy: false }
    }
    const interval = blockCandidateInterval(startDate, startTime, endDate, row.value)
    if (!interval) {
      return { ...row, disabled: true, busy: false, reason: 'invalid' }
    }
    const minutes = (interval.end_time > interval.start_time)
      ? true
      : false
    if (!minutes) {
      return { ...row, disabled: true, busy: false, reason: 'invalid' }
    }
    const busy = isBlockIntervalOccupied({
      startDate,
      startTime,
      endDate,
      endTime: row.value,
      bookings,
      blocks,
      editing,
      event,
    })
    const tooShort = (() => {
      const clip = intervalFromClocks(startDate, startTime, row.value, endDate)
      if (!clip) return true
      return false
    })()
    return {
      ...row,
      disabled: busy || tooShort,
      busy,
      reason: busy ? 'overlap' : (tooShort ? 'invalid' : null),
    }
  })
}

export function firstFreeManualStart(options) {
  return options.find((row) => !row.disabled)?.value || ''
}

export { BLOCK_MIN_MINUTES }
