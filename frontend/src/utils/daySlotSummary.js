import { formatLocalDate } from './scheduleDates'
import { dayClipMinutes, overlapsDay, wallClock, wallLabel } from './calendarB3'

function parseScheduleKey(key) {
  const m = /^(\d{4}-\d{2}-\d{2})_(\d+)_(\d+)$/.exec(key)
  if (!m) return null
  return { date: m[1], hour: Number(m[2]), minute: Number(m[3]) }
}

function minuteOfDay(hour, minute) {
  return hour * 60 + minute
}

/** Working 30-min slots for a day from master weekly schedule map (editor state, not admission). */
export function workingIntervalsForDay(schedule, dateStr) {
  const working = []
  Object.entries(schedule || {}).forEach(([key, value]) => {
    const parsed = parseScheduleKey(key)
    if (!parsed || parsed.date !== dateStr) return
    const isWorking = value === true || value?.is_working === true
    if (!isWorking) return
    const start = minuteOfDay(parsed.hour, parsed.minute)
    working.push({ start, end: start + 30 })
  })
  if (!working.length) return []
  working.sort((a, b) => a.start - b.start)
  const merged = []
  for (const slot of working) {
    const last = merged[merged.length - 1]
    if (last && slot.start <= last.end) {
      last.end = Math.max(last.end, slot.end)
    } else {
      merged.push({ ...slot })
    }
  }
  return merged
}

/** Week column header: merged working span or «Выходной». */
export function weekColumnHoursLabel(schedule, dateStr) {
  const intervals = workingIntervalsForDay(schedule, dateStr)
  if (!intervals.length) return 'Выходной'
  const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return `${fmt(intervals[0].start)}–${fmt(intervals[intervals.length - 1].end)}`
}

function isActiveBooking(booking) {
  const s = String(booking?.status || '').toLowerCase()
  return !(
    s === 'cancelled'
    || s === 'cancelled_by_client_early'
    || s === 'cancelled_by_client_late'
    || s === 'completed'
  )
}

/** Частичное пересечение 30-мин bucket (для пояснений, не authoritative availability). */
export function overlapsHalfHourBucket(dateStr, hour, minute, start, end) {
  const clip = dayClipMinutes(start, end, dateStr)
  if (!clip) return false
  const bucketStart = hour * 60 + minute
  const bucketEnd = bucketStart + 30
  return clip.startMinute < bucketEnd && clip.endMinute > bucketStart
}

export function eventOutsideWorkingHours(start, end, dateStr, schedule) {
  const clip = dayClipMinutes(start, end, dateStr)
  if (!clip) return false
  const working = workingIntervalsForDay(schedule, dateStr)
  if (!working.length) return true
  for (let t = clip.startMinute; t < clip.endMinute; t += 1) {
    const covered = working.some((w) => t >= w.start && t < w.end)
    if (!covered) return true
  }
  return false
}

/**
 * Сводка дня для «Управление слотами» — не подменяет public availability API.
 */
export function summarizeDaySlots({
  dateStr,
  slotsForDay = [],
  bookings = [],
  blocks = [],
  schedule = {},
}) {
  const openSlots = (slotsForDay || []).filter((s) => s.is_working)
  const openGridCount = openSlots.length
  const openHours = (openGridCount * 30) / 60

  const dayBookings = (bookings || []).filter(
    (b) => overlapsDay(b.start_time, b.end_time, dateStr) && isActiveBooking(b),
  )
  const dayBlocks = (blocks || []).filter((b) => overlapsDay(b.start_time, b.end_time, dateStr))

  const occupiedMinutes = dayBookings.reduce((sum, b) => {
    const clip = dayClipMinutes(b.start_time, b.end_time, dateStr)
    return sum + (clip ? clip.endMinute - clip.startMinute : 0)
  }, 0) + dayBlocks.reduce((sum, bl) => {
    const clip = dayClipMinutes(bl.start_time, bl.end_time, dateStr)
    return sum + (clip ? clip.endMinute - clip.startMinute : 0)
  }, 0)

  const workingMerged = workingIntervalsForDay(schedule, dateStr)

  const outOfHours = []
  dayBookings.forEach((b) => {
    if (eventOutsideWorkingHours(b.start_time, b.end_time, dateStr, schedule)) {
      outOfHours.push({
        kind: 'booking',
        id: b.id,
        label: `${b.service_name || 'Запись'} · ${b.guest_name || b.client_name || 'Клиент'}`,
        time: `${wallLabel(b.start_time)}–${wallLabel(b.end_time)}`,
      })
    }
  })
  dayBlocks.forEach((bl) => {
    if (eventOutsideWorkingHours(bl.start_time, bl.end_time, dateStr, schedule)) {
      outOfHours.push({
        kind: 'block',
        id: bl.id,
        label: bl.title || 'Личное событие',
        time: `${wallLabel(bl.start_time)}–${wallLabel(bl.end_time)}`,
      })
    }
  })

  const bucketsWithPartial = openSlots.filter((s) =>
    dayBookings.some((b) => overlapsHalfHourBucket(dateStr, s.hour, s.minute, b.start_time, b.end_time)),
  ).length

  return {
    dateStr,
    openGridCount,
    openHours,
    workingIntervalLabels: workingMerged.map((w) => {
      const pad = (n) => String(n).padStart(2, '0')
      const sh = Math.floor(w.start / 60)
      const sm = w.start % 60
      const eh = Math.floor(w.end / 60)
      const em = w.end % 60
      return `${pad(sh)}:${pad(sm)}–${pad(eh)}:${pad(em)}`
    }),
    activeBookingCount: dayBookings.length,
    blockCount: dayBlocks.length,
    occupiedHours: occupiedMinutes / 60,
    bucketsWithPartialOverlap: bucketsWithPartial,
    outOfHours,
    hasAuthoritativeClientAvailability: false,
  }
}

export function summarizeDaySlotsForDate(date, slotsForDay, bookings, blocks, schedule) {
  return summarizeDaySlots({
    dateStr: formatLocalDate(date),
    slotsForDay,
    bookings,
    blocks,
    schedule,
  })
}
