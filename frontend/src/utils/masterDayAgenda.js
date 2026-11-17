import { formatLocalDate } from './scheduleDates'
import { dayClipMinutes, overlapsDay, wallClock } from './calendarB3'
import { formatWallTime } from './dateFormat'
import { eventOutsideWorkingHours, workingIntervalsForDay } from './daySlotSummary'
import { blockEventSource, bookingEventSource } from './dedatoCalendarEventTokens'

/**
 * Master day agenda lists bookings/blocks only.
 *
 * Client-facing availability (day overrides, monthly grid, rules, admission, TZ)
 * is NOT exposed as an authoritative master-side list in this UI layer.
 * Public booking uses separate availability APIs — do not infer «Свободно» here.
 */
export const MASTER_DAY_AGENDA_SKIPS_CLIENT_AVAILABILITY = true

function minuteOfDay(hour, minute) {
  return hour * 60 + minute
}

function minutesToLabel(startMin, endMin) {
  const pad = (n) => String(n).padStart(2, '0')
  const sh = Math.floor(startMin / 60)
  const sm = startMin % 60
  const eh = Math.floor(endMin / 60)
  const em = endMin % 60
  return `${pad(sh)}:${pad(sm)}–${pad(eh)}:${pad(em)}`
}

export { workingIntervalsForDay } from './daySlotSummary'

function occupiedIntervals(bookings, blocks, dateStr) {
  const rows = []
  ;(bookings || []).forEach((b) => {
    const clip = dayClipMinutes(b.start_time, b.end_time, dateStr)
    if (!clip || !overlapsDay(b.start_time, b.end_time, dateStr)) return
    rows.push({
      kind: 'booking',
      start: clip.startMinute,
      end: clip.endMinute,
      meta: b,
    })
  })
  ;(blocks || []).forEach((bl) => {
    const clip = dayClipMinutes(bl.start_time, bl.end_time, dateStr)
    if (!clip || !overlapsDay(bl.start_time, bl.end_time, dateStr)) return
    rows.push({
      kind: 'block',
      start: clip.startMinute,
      end: clip.endMinute,
      meta: bl,
    })
  })
  return rows.sort((a, b) => a.start - b.start)
}

/** Day agenda: bookings and blocks from API — no synthetic availability rows. */
export function buildMasterDayAgenda({ date, schedule, bookings, blocks }) {
  const dateStr = formatLocalDate(date)
  const occupied = occupiedIntervals(bookings, blocks, dateStr)
  const timeline = []

  occupied.forEach((row) => {
    if (row.kind === 'block') {
    timeline.push({
      type: 'event',
      sort: row.start,
      source: blockEventSource(),
      time: minutesToLabel(row.start, row.end),
      title: row.meta.title || 'Личное время',
      detail: null,
      showStatus: false,
      outsideWorkingHours: eventOutsideWorkingHours(row.meta.start_time, row.meta.end_time, dateStr, schedule),
      meta: row.meta,
      kind: 'block',
    })
      return
    }
    const b = row.meta
    const client = b.guest_name || b.client_name || 'Клиент'
    const price =
      b.service_price != null && !Number.isNaN(Number(b.service_price))
        ? `${Math.round(Number(b.service_price)).toLocaleString('ru-RU')} ₽`
        : null
    timeline.push({
      type: 'event',
      sort: row.start,
      source: bookingEventSource(b),
      time: `${formatWallTime(b.start_time)}–${formatWallTime(b.end_time)}`,
      title: `${b.service_name || 'Запись'} · ${client}`,
      detail: price ? `${client} · ${price}` : client,
      showStatus: true,
      outsideWorkingHours: eventOutsideWorkingHours(b.start_time, b.end_time, dateStr, schedule),
      meta: b,
      kind: 'booking',
    })
  })

  timeline.sort((a, b) => a.sort - b.sort)
  const hasWeeklyWorkingSlots = workingIntervalsForDay(schedule, dateStr).length > 0
  return {
    dateStr,
    rows: timeline,
    hasWeeklyWorkingSlots,
    emitsClientAvailability: false,
  }
}
