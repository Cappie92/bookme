/**
 * Каноническая сетка master schedule / public slot starts (:00 / :30).
 * @see Knowledge/scheduling.md §2
 * @see frontend/src/utils/dayAvailabilityRange.js
 */
import { SLOT_MINUTE_STEPS } from './dayAvailabilityRange'

export const SCHEDULE_SLOT_STEP_MINUTES = 30
export { SLOT_MINUTE_STEPS }

export function parseWallTime(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(time || ''))
  if (!match) return null
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

/** Кратность начала на сетке расписания (не длительность услуги). */
export function isStartOnScheduleGrid(time) {
  const parsed = parseWallTime(time)
  if (!parsed) return false
  return SLOT_MINUTE_STEPS.includes(parsed.minute)
}

/** UI validation for B3 start/end wall times (no off-grid legacy exemption). */
export function scheduleGridStartError(time) {
  if (isStartOnScheduleGrid(time)) return null
  return `Начало — только :00 или :${String(SCHEDULE_SLOT_STEP_MINUTES).padStart(2, '0')} (шаг сетки ${SCHEDULE_SLOT_STEP_MINUTES} мин).`
}

export function scheduleGridEndError(time) {
  return scheduleGridStartError(time)
}

export function scheduleGridTimeOptions() {
  const rows = []
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of SLOT_MINUTE_STEPS) {
      const hh = String(hour).padStart(2, '0')
      const mm = String(minute).padStart(2, '0')
      rows.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}` })
    }
  }
  return rows
}
