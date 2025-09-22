import React, { useState } from 'react'
import { SalonBookingModule, MasterBookingModule } from '../components/booking'

export default function BookingDemo() {
  const [activeTab, setActiveTab] = useState('salon')

  const handleSalonBookingSuccess = (result) => {
    console.log('Запись в салон создана:', result)
    alert('Запись в салон успешно создана!')
  }

  const handleSalonBookingError = (error) => {
    console.error('Ошибка записи в салон:', error)
    alert(`Ошибка записи в салон: ${error}`)
  }

  const handleMasterBookingSuccess = (result) => {
    console.log('Запись к мастеру создана:', result)
    alert('Запись к мастеру успешно создана!')
  }

  const handleMasterBookingError = (error) => {
    console.error('Ошибка записи к мастеру:', error)
    alert(`Ошибка записи к мастеру: ${error}`)
  }

  return (
    <div className="min-h-screen bg-[#F9F7F6] py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Демонстрация модулей записи
          </h1>
          <p className="text-lg text-gray-600">
            Выберите тип записи для тестирования
          </p>
        </div>

        {/* Табы */}
        <div className="flex justify-center mb-8">
          <div className="flex bg-white rounded-lg shadow-sm border">
            <button
              onClick={() => setActiveTab('salon')}
              className={`px-6 py-3 rounded-l-lg font-medium transition-colors ${
                activeTab === 'salon'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Запись в салон
            </button>
            <button
              onClick={() => setActiveTab('master')}
              className={`px-6 py-3 rounded-r-lg font-medium transition-colors ${
                activeTab === 'master'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Запись к мастеру
            </button>
          </div>
        </div>

        {/* Контент */}
        <div className="bg-white rounded-lg shadow-lg">
          {activeTab === 'salon' ? (
            <div>
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Модуль записи в салон
                </h2>
                <p className="text-gray-600">
                  Этот модуль позволяет записаться в салон с возможностью выбора мастера или записи к любому доступному мастеру.
                </p>
              </div>
              <div className="p-6">
                <SalonBookingModule
                  salonId={1}
                  onBookingSuccess={handleSalonBookingSuccess}
                  onBookingError={handleSalonBookingError}
                  title="Запись в салон красоты"
                  showUserInfo={true}
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Модуль записи к мастеру
                </h2>
                <p className="text-gray-600">
                  Этот модуль позволяет записаться к конкретному мастеру без выбора мастера.
                </p>
              </div>
              <div className="p-6">
                <MasterBookingModule
                  masterId={1}
                  onBookingSuccess={handleMasterBookingSuccess}
                  onBookingError={handleMasterBookingError}
                  title="Запись к мастеру"
                  showUserInfo={true}
                />
              </div>
            </div>
          )}
        </div>

        {/* Информация о модулях */}
        <div className="mt-8 grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              SalonBookingModule
            </h3>
            <ul className="space-y-2 text-gray-600">
              <li>• Выбор мастера (или "любой мастер")</li>
              <li>• Загрузка мастеров салона</li>
              <li>• Загрузка услуг салона</li>
              <li>• Запись к салону или конкретному мастеру</li>
              <li>• Полная функциональность модуля записи</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              MasterBookingModule
            </h3>
            <ul className="space-y-2 text-gray-600">
              <li>• Запись только к конкретному мастеру</li>
              <li>• Загрузка услуг мастера</li>
              <li>• Упрощенный интерфейс</li>
              <li>• Оптимизирован для страниц мастеров</li>
              <li>• Та же функциональность записи</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
} 