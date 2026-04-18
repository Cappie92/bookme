import { isSameDay } from 'date-fns'

const SLOT_MINUTES = [0, 30]

function localDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Агрегирует слоты месячного API по календарному дню (локальная дата).
 */
export function aggregateMonthDayStats(date, monthlySchedule) {
  const empty = {
    hasWork: false,
    hasConflict: false,
    hasSalon: false,
    hasPersonal: false,
    isFrozen: false
  }
  if (!monthlySchedule || typeof monthlySchedule !== 'object') {
    return empty
  }
  const dateStr = localDateStr(date)
  let hasWork = false
  let hasConflict = false
  let hasSalon = false
  let hasPersonal = false
  let isFrozen = false

  for (let hour = 0; hour < 24; hour++) {
    for (const minute of SLOT_MINUTES) {
      const key = `${dateStr}_${hour}_${minute}`
      const slot = monthlySchedule[key]
      if (!slot) continue
      if (slot.is_frozen) isFrozen = true
      if (slot.is_working) {
        hasWork = true
        if (slot.has_conflict) hasConflict = true
        const wt = slot.work_type
        if (wt === 'salon') hasSalon = true
        else if (wt === 'personal') hasPersonal = true
      }
    }
  }
  return { hasWork, hasConflict, hasSalon, hasPersonal, isFrozen }
}

/**
 * Один итоговый визуальный тип дня для month overview.
 * Приоритет: frozen → today → работа (конфликт / салон / личное) → выходной (сб–вс / будни) → чужой месяц.
 */
export function classifyMonthDayVisual(date, isCurrentMonth, monthlySchedule, today = new Date()) {
  const stats = aggregateMonthDayStats(date, monthlySchedule)
  if (!isCurrentMonth) {
    return { kind: 'other_month', stats }
  }
  if (stats.isFrozen) {
    return { kind: 'frozen', stats }
  }
  if (isSameDay(date, today)) {
    return { kind: 'today', stats }
  }
  if (stats.hasWork) {
    if (stats.hasConflict) return { kind: 'work_conflict', stats }
    if (stats.hasSalon) return { kind: 'work_salon', stats }
    if (stats.hasPersonal) return { kind: 'work_personal', stats }
    return { kind: 'work_personal', stats }
  }
  const dow = date.getDay()
  const isWeekend = dow === 0 || dow === 6
  if (isWeekend) return { kind: 'weekend_off', stats }
  return { kind: 'weekday_off', stats }
}

/** Ровно один набор bg/border на ячейку (без конкурирующих bg-*). */
export function getMonthDayCellClass(kind) {
  switch (kind) {
    case 'other_month':
      return 'text-gray-300 bg-white border-transparent cursor-default opacity-60'
    case 'frozen':
      return 'bg-cyan-100 border-cyan-300 text-cyan-900 cursor-pointer hover:brightness-[0.98]'
    case 'today':
      return 'bg-blue-100 border-blue-400 ring-1 ring-blue-300 font-semibold text-blue-900 cursor-pointer hover:brightness-[0.98]'
    case 'work_conflict':
      return 'bg-red-100 border-red-300 text-red-900 cursor-pointer hover:brightness-[0.98]'
    case 'work_salon':
      return 'bg-indigo-100 border-indigo-300 text-indigo-900 cursor-pointer hover:brightness-[0.98]'
    case 'work_personal':
      return 'bg-green-100 border-green-300 text-green-900 cursor-pointer hover:brightness-[0.98]'
    case 'weekend_off':
      return 'bg-gray-100 border-gray-200 text-gray-700 cursor-pointer hover:bg-gray-200/80'
    case 'weekday_off':
    default:
      return 'bg-gray-50 border-gray-200 text-gray-600 cursor-pointer hover:bg-gray-100/80'
  }
}

/** Легенда строго по поддерживаемым состояниям (совпадает с classify + getMonthDayCellClass). */
export const MONTH_OVERVIEW_LEGEND = [
  { kind: 'frozen', label: 'Тариф заморожен', swatchClass: 'bg-cyan-100 border border-cyan-300' },
  { kind: 'today', label: 'Сегодня', swatchClass: 'bg-blue-100 border border-blue-400 ring-1 ring-blue-300' },
  { kind: 'work_personal', label: 'Рабочий день (личное)', swatchClass: 'bg-green-100 border border-green-300' },
  { kind: 'work_salon', label: 'Работа в салоне', swatchClass: 'bg-indigo-100 border border-indigo-300' },
  { kind: 'work_conflict', label: 'Конфликт в расписании', swatchClass: 'bg-red-100 border border-red-300' },
  { kind: 'weekend_off', label: 'Выходной (сб–вс)', swatchClass: 'bg-gray-100 border border-gray-200' },
  { kind: 'weekday_off', label: 'Нет слотов (будни)', swatchClass: 'bg-gray-50 border border-gray-200' }
]
