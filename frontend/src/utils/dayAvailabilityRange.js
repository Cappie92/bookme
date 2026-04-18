/**
 * Day-level интервал только на сетке 30 мин (:00 / :30) → слоты для PUT /api/master/schedule/day
 */

export const SLOT_MINUTE_STEPS = [0, 30]

export function minutesFromMidnight(hour, minute) {
  return hour * 60 + minute
}

export function resolveDayRangeMinutes(startHour, startMinute, endHour, endMinute) {
  if (
    startHour < 0 ||
    startHour > 23 ||
    endHour < 0 ||
    endHour > 24 ||
    !SLOT_MINUTE_STEPS.includes(startMinute) ||
    (endHour < 24 && !SLOT_MINUTE_STEPS.includes(endMinute))
  ) {
    return { ok: false, error: 'Выберите время только на :00 или :30.' }
  }
  if (endHour === 24 && endMinute !== 0) {
    return { ok: false, error: 'Для конца дня выберите 24:00.' }
  }

  const startMin = minutesFromMidnight(startHour, startMinute)
  const endMin = endHour === 24 ? 24 * 60 : minutesFromMidnight(endHour, endMinute)

  if (startMin >= endMin) {
    return { ok: false, error: 'Время окончания должно быть позже начала.' }
  }

  if (startMin % 30 !== 0 || endMin % 30 !== 0) {
    return { ok: false, error: 'Интервал должен быть кратен 30 минутам.' }
  }

  return { ok: true, startMin, endMin }
}

/** Слоты с началом t, где startMin <= t < endMin (полуинтервал [start, end)). */
export function thirtyMinuteSlotsInRange(startMin, endMin) {
  if (startMin % 30 !== 0 || endMin % 30 !== 0 || startMin >= endMin) {
    return []
  }
  const out = []
  for (let t = startMin; t < endMin; t += 30) {
    const hour = Math.floor(t / 60)
    const minute = t % 60
    out.push({ hour, minute })
  }
  return out
}
