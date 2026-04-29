/**
 * Сетка календаря на месяц — точная копия из PublicBookingWizard.
 * Вынесена в отдельный модуль, чтобы переиспользовать в клиентских модалках
 * (RepeatBookingModal, TimeEdit) без дублирования и без визуальных отличий.
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
import React, { useState, useMemo, useCallback } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

export function CalendarGrid({
  availableDateSet,
  minDateStr,
  maxDateStr,
  selectedDate,
  onSelectDate,
  onMonthChange,
}) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

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
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <button
          type="button"
          onClick={() => {
            let nextY = viewYear
            let nextM = viewMonth
            if (viewMonth === 0) { nextY = viewYear - 1; nextM = 11 }
            else { nextM = viewMonth - 1 }
            setViewYear(nextY)
            setViewMonth(nextM)
            if (typeof onMonthChange === 'function') onMonthChange({ year: nextY, month: nextM })
          }}
          disabled={!canPrev}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:pointer-events-none"
          data-testid="month-prev"
          aria-label="Предыдущий месяц"
        >
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <span className="text-sm font-medium text-gray-700 capitalize">{monthLabel}</span>
        <button
          type="button"
          onClick={() => {
            let nextY = viewYear
            let nextM = viewMonth
            if (viewMonth === 11) { nextY = viewYear + 1; nextM = 0 }
            else { nextM = viewMonth + 1 }
            setViewYear(nextY)
            setViewMonth(nextM)
            if (typeof onMonthChange === 'function') onMonthChange({ year: nextY, month: nextM })
          }}
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
          <div key={wd} className="py-1.5 text-gray-500 font-medium">
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
              className={`py-2 rounded ${
                available
                  ? selected
                    ? 'bg-[#4CAF50] text-white font-medium'
                    : 'hover:bg-green-50 text-gray-900'
                  : 'text-gray-300 cursor-not-allowed'
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
