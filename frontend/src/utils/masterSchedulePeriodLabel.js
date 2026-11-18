/**
 * Compact period labels for master schedule header (Figma 16.11).
 */

function monthGenitiveRu(date) {
  const sample = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  return sample.replace(/^\d+\s*/, '').trim()
}

function dayAndMonthRu(date) {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

export function formatMasterSchedulePeriodLabel(calendarLayoutMode, focusDay, weekDates) {
  if (calendarLayoutMode === 'day') {
    return focusDay.toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  if (!weekDates?.length || weekDates.length < 7) {
    return 'Расписание на неделю'
  }

  const start = weekDates[0].date
  const end = weekDates[6].date
  const year = end.getFullYear()

  if (start.getFullYear() !== year) {
    return `${start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} – ${end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`
  }

  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${monthGenitiveRu(start)} ${year}`
  }

  return `${dayAndMonthRu(start)} – ${dayAndMonthRu(end)} ${year}`
}