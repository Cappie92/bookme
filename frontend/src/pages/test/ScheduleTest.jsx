import React from 'react'
import { formatWorkingHoursShort, formatWorkingHoursFull, formatWorkingHoursCompact } from '../../utils/scheduleUtils'

export default function ScheduleTest() {
  // Тестовые данные
  const testSchedule = {
    monday: { enabled: true, open: "09:00", close: "18:00" },
    tuesday: { enabled: true, open: "09:00", close: "18:00" },
    wednesday: { enabled: true, open: "09:00", close: "18:00" },
    thursday: { enabled: true, open: "09:00", close: "18:00" },
    friday: { enabled: true, open: "09:00", close: "18:00" },
    saturday: { enabled: false, open: "10:00", close: "16:00" },
    sunday: { enabled: false, open: "10:00", close: "16:00" }
  }

  const shortFormat = formatWorkingHoursShort(JSON.stringify(testSchedule))
  const fullFormat = formatWorkingHoursFull(JSON.stringify(testSchedule))
  const compactFormat = formatWorkingHoursCompact(JSON.stringify(testSchedule))

  return (
    <div className="min-h-screen bg-[#F9F7F6] py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
          Тест обновленного расписания
        </h1>

        <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Краткий формат (должен показывать "Пн", "Вт" и т.д.)
            </h2>
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-lg font-mono">{shortFormat}</p>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Полный формат (полные названия дней)
            </h2>
            <div className="p-4 bg-green-50 rounded-lg">
              <pre className="whitespace-pre-line font-mono">{fullFormat}</pre>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Компактный формат (сокращенные названия дней)
            </h2>
            <div className="p-4 bg-yellow-50 rounded-lg">
              <pre className="whitespace-pre-line font-mono">{compactFormat}</pre>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Исходные данные
            </h2>
            <div className="p-4 bg-gray-50 rounded-lg">
              <pre className="text-sm overflow-auto">
                {JSON.stringify(testSchedule, null, 2)}
              </pre>
            </div>
          </div>

          <div className="text-center">
            <p className="text-gray-600">
              Если вы видите "Пн", "Вт", "Ср" и т.д. - изменения применились! 🎉
            </p>
            <p className="text-gray-600 mt-2">
              Если все еще видите "пн", "вт", "ср" - обновите страницу (Ctrl+F5)
            </p>
          </div>
        </div>
      </div>
    </div>
  )
} 