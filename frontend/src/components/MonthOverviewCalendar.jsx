import React from 'react'
import { getMonthDays, getDayNames } from '../utils/calendarUtils'
import {
  classifyMonthDayVisual,
  getMonthDayCellClass,
  MONTH_OVERVIEW_LEGEND
} from '../utils/monthScheduleCalendar'

/**
 * Единая сетка month overview: данные только из monthlySchedule (API /master/schedule/monthly).
 */
export default function MonthOverviewCalendar({
  currentMonth,
  monthlySchedule,
  loading = false,
  layout = 'embedded',
  showLegend = true,
  onDayClick
}) {
  const days = getMonthDays(currentMonth)
  const dayNames = getDayNames()
  const today = new Date()
  const cellPad = layout === 'modal' ? 'p-2 min-h-[3rem]' : 'p-2 min-h-16'

  if (loading) {
    return (
      <div className={layout === 'embedded' ? 'p-4' : ''}>
        <div className="text-center text-gray-500 py-8">Загрузка календаря…</div>
      </div>
    )
  }

  return (
    <div className={layout === 'embedded' ? 'p-4' : ''}>
      <div className="grid grid-cols-7 gap-1">
        {dayNames.map(day => (
          <div
            key={day}
            className={`text-center text-sm font-medium text-gray-500 ${layout === 'modal' ? 'p-2' : 'py-2 font-semibold text-gray-600'}`}
          >
            {day}
          </div>
        ))}
        {days.map((day, index) => {
          const { kind, stats } = classifyMonthDayVisual(day.date, day.isCurrentMonth, monthlySchedule, today)
          const cellClass = getMonthDayCellClass(kind)
          const showWorkHint = kind === 'today' && stats.hasWork

          return (
            <div
              key={index}
              role={day.isCurrentMonth ? 'button' : undefined}
              tabIndex={day.isCurrentMonth ? 0 : undefined}
              className={`border rounded text-center text-sm flex flex-col items-center justify-start ${cellPad} ${cellClass}`}
              title={
                kind === 'frozen'
                  ? 'Тариф заморожен'
                  : kind === 'work_conflict'
                    ? 'Конфликт в расписании'
                    : undefined
              }
              onClick={() => {
                if (!day.isCurrentMonth) return
                onDayClick?.(day.date)
              }}
              onKeyDown={e => {
                if (!day.isCurrentMonth) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onDayClick?.(day.date)
                }
              }}
            >
              <span>{day.date.getDate()}</span>
              {stats.hasWork && kind !== 'today' && kind !== 'other_month' && (
                <span className="text-xs mt-0.5 leading-none" aria-hidden>
                  {stats.hasConflict ? '⚠️' : stats.hasSalon ? '🏢' : '👤'}
                </span>
              )}
              {showWorkHint && (
                <span className="text-[10px] mt-0.5 leading-none text-blue-800" aria-hidden>
                  {stats.hasConflict ? '⚠️' : stats.hasSalon ? '🏢' : '👤'}
                </span>
              )}
            </div>
          )
        })}
      </div>
      {showLegend && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
          {MONTH_OVERVIEW_LEGEND.map(item => (
            <div key={item.kind} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded shrink-0 ${item.swatchClass}`} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
