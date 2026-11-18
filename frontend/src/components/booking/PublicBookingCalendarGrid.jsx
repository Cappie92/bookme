/**
 * Сетка календаря на месяц — точная копия из PublicBookingWizard.
 * Вынесена в отдельный модуль, чтобы переиспользовать в клиентских модалках
 * (RepeatBookingModal, TimeEdit) без дублирования разметки.
 *
 * Контракт исходных пропсов из /m/:slug сохранён без изменений:
 *   - availableDateSet: Set<string>  доступные даты в формате YYYY-MM-DD
 *   - minDateStr / maxDateStr: string|null  ограничители навигации
 *   - selectedDate: string|null  текущий выбор YYYY-MM-DD
 *   - onSelectDate(dateStr: string)  колбэк
 *
 * Опциональный, чисто аддитивный пропс (PublicBookingWizard его не передаёт,
 * поведение публичной страницы не меняется):
 *   - onMonthChange?({ year, month })  вызывается после смены месяца стрелками,
 *     0-indexed month, чтобы потребитель мог дозагрузить availability на новый
 *     месяц.
 */
import React, { useState, useMemo, useCallback, useRef } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function dateInRange(dateStr, minDateStr, maxDateStr) {
  if (minDateStr && dateStr < minDateStr) return false
  if (maxDateStr && dateStr > maxDateStr) return false
  return true
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function monthBounds(year, month) {
  const last = new Date(year, month + 1, 0).getDate()
  return {
    start: `${year}-${pad2(month + 1)}-01`,
    end: `${year}-${pad2(month + 1)}-${pad2(last)}`,
  }
}

function eachDate(availableDateSet, visit) {
  if (!availableDateSet || typeof availableDateSet.forEach !== 'function') return
  availableDateSet.forEach((dateStr) => {
    if (typeof dateStr === 'string' && DATE_KEY.test(dateStr)) visit(dateStr)
  })
}

export function monthIntersectsWindow(year, month, minDateStr, maxDateStr) {
  const { start, end } = monthBounds(year, month)
  if (maxDateStr && start > maxDateStr) return false
  if (minDateStr && end < minDateStr) return false
  return true
}

export function monthHasAvailable(year, month, availableDateSet, minDateStr, maxDateStr) {
  const prefix = `${year}-${pad2(month + 1)}-`
  let found = false
  eachDate(availableDateSet, (dateStr) => {
    if (found || !dateStr.startsWith(prefix)) return
    if (!dateInRange(dateStr, minDateStr, maxDateStr)) return
    found = true
  })
  return found
}

function firstInRangeDate(availableDateSet, minDateStr, maxDateStr) {
  let earliest = null
  eachDate(availableDateSet, (dateStr) => {
    if (!dateInRange(dateStr, minDateStr, maxDateStr)) return
    if (earliest === null || dateStr < earliest) earliest = dateStr
  })
  return earliest
}

function monthOfDate(dateStr) {
  return { year: Number(dateStr.slice(0, 4)), month: Number(dateStr.slice(5, 7)) - 1 }
}

function shiftMonth(year, month, delta) {
  const shifted = new Date(year, month + delta, 1)
  return { year: shifted.getFullYear(), month: shifted.getMonth() }
}

/**
 * Сначала месяц referenceDate, если в нём есть слот внутри окна.
 * Иначе месяц первой доступной даты. Пустой набор остаётся на referenceDate.
 */
export function resolveAutomaticMonth(availableDateSet, minDateStr, maxDateStr, today = new Date()) {
  const current = { year: today.getFullYear(), month: today.getMonth() }
  if (monthHasAvailable(current.year, current.month, availableDateSet, minDateStr, maxDateStr)) {
    return current
  }
  const earliest = firstInRangeDate(availableDateSet, minDateStr, maxDateStr)
  if (earliest) return monthOfDate(earliest)
  return current
}

/** Ручной месяц остаётся в state, только пока он пересекает окно. Иначе state очищается в этом же рендере. */
export function resolveVisibleMonth({
  availableDateSet,
  minDateStr,
  maxDateStr,
  today = new Date(),
  manualMonth = null,
}) {
  if (
    manualMonth
    && Number.isInteger(manualMonth.year)
    && Number.isInteger(manualMonth.month)
    && monthIntersectsWindow(manualMonth.year, manualMonth.month, minDateStr, maxDateStr)
  ) {
    return { year: manualMonth.year, month: manualMonth.month }
  }
  return resolveAutomaticMonth(availableDateSet, minDateStr, maxDateStr, today)
}

export function CalendarGrid({
  availableDateSet,
  minDateStr,
  maxDateStr,
  selectedDate,
  onSelectDate,
  onMonthChange,
  referenceDate,
  viewResetKey = null,
}) {
  const fallbackToday = useRef(null)
  if (fallbackToday.current == null) fallbackToday.current = new Date()
  const today = referenceDate ?? fallbackToday.current

  const [manualMonth, setManualMonth] = useState(null)
  const [seenResetKey, setSeenResetKey] = useState(viewResetKey)
  const resetPending = seenResetKey !== viewResetKey
  const manualOutside = Boolean(
    manualMonth
    && !monthIntersectsWindow(manualMonth.year, manualMonth.month, minDateStr, maxDateStr)
  )
  if (resetPending) {
    setSeenResetKey(viewResetKey)
    setManualMonth(null)
  } else if (manualOutside) {
    setManualMonth(null)
  }

  const visible = resolveVisibleMonth({
    availableDateSet,
    minDateStr,
    maxDateStr,
    today,
    manualMonth: (resetPending || manualOutside) ? null : manualMonth,
  })
  const viewYear = visible.year
  const viewMonth = visible.month

  const showMonth = (next) => {
    setManualMonth(next)
    if (typeof onMonthChange === 'function') onMonthChange(next)
  }

  const minDate = useMemo(() => (minDateStr ? new Date(minDateStr + 'T12:00:00') : null), [minDateStr])
  const maxDate = useMemo(() => (maxDateStr ? new Date(maxDateStr + 'T12:00:00') : null), [maxDateStr])

  const { daysInMonth, startPadding } = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1)
    const last = new Date(viewYear, viewMonth + 1, 0)
    const firstWeekday = (first.getDay() + 6) % 7
    return {
      daysInMonth: last.getDate(),
      startPadding: firstWeekday,
    }
  }, [viewYear, viewMonth])

  const canPrev = useMemo(() => {
    if (!minDate) return false
    return viewMonth > minDate.getMonth() || viewYear > minDate.getFullYear()
  }, [viewYear, viewMonth, minDate])

  const canNext = useMemo(() => {
    if (!maxDate) return false
    return viewMonth < maxDate.getMonth() || viewYear < maxDate.getFullYear()
  }, [viewYear, viewMonth, maxDate])

  const isDateAvailable = useCallback(
    (y, m, d) => {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      if (!availableDateSet.has(dateStr)) return false
      if (minDateStr && dateStr < minDateStr) return false
      if (maxDateStr && dateStr > maxDateStr) return false
      return true
    },
    [availableDateSet, minDateStr, maxDateStr]
  )

  const cells = useMemo(() => {
    const list = []
    for (let i = 0; i < startPadding; i++) list.push({ type: 'pad', key: `p-${i}` })
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const available = isDateAvailable(viewYear, viewMonth, d)
      list.push({ type: 'day', dateStr, d, available, key: dateStr })
    }
    return list
  }, [viewYear, viewMonth, daysInMonth, startPadding, isDateAvailable])

  const monthLabel = `${new Date(viewYear, viewMonth).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`

  return (
    <div className="border border-[#E8E2DD] rounded-[14px] overflow-hidden bg-white shadow-[0_1px_2px_rgba(45,45,45,0.03)]">
      <div className="flex items-center justify-between border-b border-[#E8E2DD] px-3 py-2.5 bg-[#FAFAFB]">
        <button
          type="button"
          onClick={() => showMonth(shiftMonth(viewYear, viewMonth, -1))}
          disabled={!canPrev}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
          data-testid="month-prev"
          aria-label="Предыдущий месяц"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <span
          className="text-sm font-semibold text-neutral-800 capitalize tracking-tight"
          data-testid="calendar-month"
          data-month={`${viewYear}-${pad2(viewMonth + 1)}`}
        >
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => showMonth(shiftMonth(viewYear, viewMonth, 1))}
          disabled={!canNext}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
          data-testid="month-next"
          aria-label="Следующий месяц"
        >
          <ChevronRightIcon className="w-5 h-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-sm">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="py-2 text-neutral-400 text-xs font-semibold uppercase tracking-wide">
            {wd}
          </div>
        ))}
        {cells.map((cell) => {
          if (cell.type === 'pad') return <div key={cell.key} />
          const { dateStr, d, available } = cell
          const selected = selectedDate === dateStr
          return (
            <button
              key={cell.key}
              type="button"
              disabled={!available}
              onClick={() => available && onSelectDate(dateStr)}
              className={`py-2.5 rounded-lg mx-0.5 text-[15px] transition-colors ${
                available
                  ? selected
                    ? 'bg-[#DFF5EC] text-[#1B5E20] font-semibold ring-1 ring-inset ring-[#4CAF50]/50'
                    : 'hover:bg-[#F4FBF6] text-[#373A41] font-medium'
                  : 'text-[#C5C8CE] cursor-not-allowed'
              }`}
              data-testid={available ? `date-cell-${dateStr}` : undefined}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CalendarGrid
