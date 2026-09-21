// Schedule keys are calendar dates, not UTC timestamps.
export function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Calendar date from a Date or ISO-like backend value. Never uses UTC conversion. */
export function calendarDateFromValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatLocalDate(value)
  }
  if (typeof value !== 'string' || !value) return ''
  const datePart = value.slice(0, 10)
  return DATE_ONLY_RE.test(datePart) ? datePart : ''
}

/** YYYY-MM-DD or ISO datetime → DD.MM.YY without `new Date("YYYY-MM-DD")`. */
export function formatCalendarDateDisplay(value) {
  const date = calendarDateFromValue(value)
  const match = DATE_ONLY_RE.exec(date)
  if (!match) return ''
  return `${match[3]}.${match[2]}.${match[1].slice(2)}`
}

export function rescheduleCalendarDate(booking) {
  return calendarDateFromValue(booking?.start_time || booking?.date)
}

export function rescheduleSlotsHeading(dateValue) {
  const display = formatCalendarDateDisplay(dateValue)
  return display ? `Доступные слоты на ${display}` : 'Доступные слоты'
}

export function rescheduleAvailabilityQuery(dateValue) {
  const date = calendarDateFromValue(dateValue)
  return date ? `date=${date}` : ''
}

/** Dates with slots, including weekends. Past calendar days are omitted. */
export function timeEditAvailableDateSet(dateAvailability, todayStr) {
  const set = new Set()
  for (const [dateStr, hasSlots] of Object.entries(dateAvailability || {})) {
    if (hasSlots !== true) continue
    if (todayStr && dateStr < todayStr) continue
    set.add(dateStr)
  }
  return set
}

/** Local YYYY-MM-DD keys for a month. `monthIndex` is 0-based. */
export function localCalendarDateStringsForMonth(year, monthIndex) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const dates = []
  for (let day = 1; day <= daysInMonth; day += 1) {
    dates.push(formatLocalDate(new Date(year, monthIndex, day)))
  }
  return dates
}

export function localizeScheduleError(message) {
  return String(message).replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3.$2.$1')
}

/** Send complete slot state only for explicitly edited dates, never past week padding. */
export function editedScheduleDays(schedule, updates) {
  const merged = { ...schedule, ...updates }
  const dates = [...new Set(Object.keys(updates).map(key => key.split('_')[0]))].sort()
  return dates.map(schedule_date => ({
    schedule_date,
    open_slots: Array.from({ length: 48 }, (_, index) => ({
      hour: Math.floor(index / 2), minute: (index % 2) * 30,
    })).filter(({ hour, minute }) => {
      const slot = merged[`${schedule_date}_${hour}_${minute}`]
      return typeof slot === 'object' && slot !== null ? !!slot.is_working : !!slot
    }),
  }))
}
