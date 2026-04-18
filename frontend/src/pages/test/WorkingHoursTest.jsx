import React, { useState } from 'react'
import WorkingHours, { WorkingHoursShort, WorkingHoursFull } from '../../components/WorkingHours'

export default function WorkingHoursTest() {
  // Тестовые данные расписания
  const testSchedules = {
    standard: {
      monday: { enabled: true, open: "09:00", close: "18:00" },
      tuesday: { enabled: true, open: "09:00", close: "18:00" },
      wednesday: { enabled: true, open: "09:00", close: "18:00" },
      thursday: { enabled: true, open: "09:00", close: "18:00" },
      friday: { enabled: true, open: "09:00", close: "18:00" },
      saturday: { enabled: false, open: "10:00", close: "16:00" },
      sunday: { enabled: false, open: "10:00", close: "16:00" }
    },
    extended: {
      monday: { enabled: true, open: "08:00", close: "20:00" },
      tuesday: { enabled: true, open: "08:00", close: "20:00" },
      wednesday: { enabled: true, open: "08:00", close: "20:00" },
      thursday: { enabled: true, open: "08:00", close: "20:00" },
      friday: { enabled: true, open: "08:00", close: "20:00" },
      saturday: { enabled: true, open: "09:00", close: "18:00" },
      sunday: { enabled: true, open: "10:00", close: "16:00" }
    },
    weekend: {
      monday: { enabled: false, open: "09:00", close: "18:00" },
      tuesday: { enabled: false, open: "09:00", close: "18:00" },
      wednesday: { enabled: false, open: "09:00", close: "18:00" },
      thursday: { enabled: false, open: "09:00", close: "18:00" },
      friday: { enabled: false, open: "09:00", close: "18:00" },
      saturday: { enabled: true, open: "10:00", close: "20:00" },
      sunday: { enabled: true, open: "10:00", close: "20:00" }
    }
  }

  const [selectedSchedule, setSelectedSchedule] = useState('standard')
  const [showStatus, setShowStatus] = useState(true)
  const [showSchedule, setShowSchedule] = useState(true)
  const [timezone, setTimezone] = useState('Europe/Moscow')

  return (
    <div className="min-h-screen bg-[#F9F7F6] py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Тестирование компонента расписания
          </h1>
          <p className="text-lg text-gray-600">
            Демонстрация различных вариантов отображения часов работы
          </p>
        </div>

        {/* Управление */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Настройки
          </h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Тип расписания
              </label>
              <select
                value={selectedSchedule}
                onChange={(e) => setSelectedSchedule(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="standard">Стандартное (пн-пт 9-18)</option>
                <option value="extended">Расширенное (пн-вс)</option>
                <option value="weekend">Только выходные</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Временная зона
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Europe/Moscow">Москва (UTC+3)</option>
                <option value="Europe/London">Лондон (UTC+0)</option>
                <option value="America/New_York">Нью-Йорк (UTC-5)</option>
                <option value="Asia/Tokyo">Токио (UTC+9)</option>
              </select>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Показывать статус
                </label>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={showStatus}
                    onChange={(e) => setShowStatus(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Отображать статус работы
                  </span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Показывать расписание
                </label>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={showSchedule}
                    onChange={(e) => setShowSchedule(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Отображать часы работы
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Демонстрация компонентов */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Краткий формат */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Краткий формат (WorkingHoursShort)
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">С статусом:</h4>
                <WorkingHoursShort 
                  workingHours={JSON.stringify(testSchedules[selectedSchedule])}
                  showStatus={showStatus}
                  showSchedule={showSchedule}
                  timezone={timezone}
                />
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Без статуса:</h4>
                <WorkingHoursShort 
                  workingHours={JSON.stringify(testSchedules[selectedSchedule])}
                  showStatus={false}
                  showSchedule={showSchedule}
                  timezone={timezone}
                />
              </div>
            </div>
          </div>

          {/* Полный формат */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Полный формат (WorkingHoursFull)
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">С статусом:</h4>
                <WorkingHoursFull 
                  workingHours={JSON.stringify(testSchedules[selectedSchedule])}
                  showStatus={showStatus}
                  showSchedule={showSchedule}
                  timezone={timezone}
                />
              </div>
              
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Без статуса:</h4>
                <WorkingHoursFull 
                  workingHours={JSON.stringify(testSchedules[selectedSchedule])}
                  showStatus={false}
                  showSchedule={showSchedule}
                  timezone={timezone}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Исходные данные */}
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Исходные данные (JSON)
          </h2>
          <div className="bg-gray-50 p-4 rounded-lg">
            <pre className="text-sm text-gray-800 overflow-auto">
              {JSON.stringify(testSchedules[selectedSchedule], null, 2)}
            </pre>
          </div>
        </div>

        {/* Примеры использования */}
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Примеры использования
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                В заголовке страницы:
              </h3>
              <div className="p-4 bg-blue-50 rounded-lg">
                <h4 className="font-bold text-gray-900 mb-2">Название салона</h4>
                <p className="text-gray-600 mb-2">📍 Москва</p>
                <WorkingHoursShort 
                  workingHours={JSON.stringify(testSchedules[selectedSchedule])}
                  showStatus={true}
                  showSchedule={false}
                  className="text-sm"
                  timezone={timezone}
                />
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                В контактной информации:
              </h3>
              <div className="p-4 bg-green-50 rounded-lg">
                <h4 className="font-bold text-gray-900 mb-3">Контактная информация</h4>
                <div className="space-y-2 text-sm">
                  <p>📞 +7 (999) 123-45-67</p>
                  <p>✉️ info@salon.ru</p>
                  <p>📍 ул. Примерная, д. 1</p>
                  <div className="mt-3">
                    <WorkingHoursFull 
                      workingHours={JSON.stringify(testSchedules[selectedSchedule])}
                      showStatus={true}
                      timezone={timezone}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 