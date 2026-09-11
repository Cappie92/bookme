// Schedule keys are calendar dates, not UTC timestamps.
export function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
