import React from 'react'
import { ClockIcon } from '@heroicons/react/24/outline'
import { 
  formatWorkingHoursShort, 
  formatWorkingHoursFull, 
  formatWorkingHoursCompact,
  getWorkingStatus 
} from '../utils/scheduleUtils'

export default function WorkingHours({ 
  workingHours, 
  variant = 'short', // 'short', 'full' или 'compact'
  showStatus = true,
  showSchedule = true,
  className = "",
  timezone = 'Europe/Moscow'
}) {
  if (!workingHours) {
    return (
      <div className={`text-gray-500 ${className}`}>
        <ClockIcon className="inline w-4 h-4 mr-2" />
        Расписание не указано
      </div>
    )
  }

  const status = getWorkingStatus(workingHours, timezone)
  const formattedHours = variant === 'short' 
    ? formatWorkingHoursShort(workingHours)
    : variant === 'compact'
    ? formatWorkingHoursCompact(workingHours)
    : formatWorkingHoursFull(workingHours)

  return (
    <div className={className}>
      {/* Статус работы */}
      {showStatus && (
        <div className="mb-2">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            status.status === 'open' 
              ? 'bg-green-100 text-green-800' 
              : status.status === 'closed'
              ? 'bg-red-100 text-red-800'
              : 'bg-gray-100 text-gray-800'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-1 ${
              status.status === 'open' 
                ? 'bg-green-400' 
                : status.status === 'closed'
                ? 'bg-red-400'
                : 'bg-gray-400'
            }`}></div>
            {status.message}
          </span>
        </div>
      )}

      {/* Расписание */}
      {showSchedule && (
        <div className="flex items-start">
          <ClockIcon className="w-4 h-4 mr-2 mt-0.5 text-gray-500 flex-shrink-0" />
          <div className="text-gray-700">
            {variant === 'short' ? (
              <span>{formattedHours}</span>
            ) : (
              <div className="whitespace-pre-line text-sm">
                {formattedHours}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Компонент для краткого отображения
export function WorkingHoursShort({ workingHours, showStatus = true, showSchedule = true, className = "", timezone = 'Europe/Moscow' }) {
  return (
    <WorkingHours 
      workingHours={workingHours} 
      variant="short" 
      showStatus={showStatus}
      showSchedule={showSchedule}
      className={className}
      timezone={timezone}
    />
  )
}

// Компонент для полного отображения
export function WorkingHoursFull({ workingHours, showStatus = true, showSchedule = true, className = "", timezone = 'Europe/Moscow' }) {
  return (
    <WorkingHours 
      workingHours={workingHours} 
      variant="full" 
      showStatus={showStatus}
      showSchedule={showSchedule}
      className={className}
      timezone={timezone}
    />
  )
}

// Компонент для компактного отображения (сокращенные названия дней)
export function WorkingHoursCompact({ workingHours, showStatus = true, showSchedule = true, className = "", timezone = 'Europe/Moscow' }) {
  return (
    <WorkingHours 
      workingHours={workingHours} 
      variant="compact" 
      showStatus={showStatus}
      showSchedule={showSchedule}
      className={className}
      timezone={timezone}
    />
  )
} 