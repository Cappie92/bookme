import React, { useState } from 'react'
import SalonBookingModule from '../components/booking/SalonBookingModule'

export default function TestAnyMaster() {
  const [salonId] = useState(2) // Тестовый салон

  const handleBookingSuccess = (result) => {
    console.log('✅ Запись успешно создана:', result)
    alert('Запись успешно создана!')
  }

  const handleBookingError = (error) => {
    console.error('❌ Ошибка создания записи:', error)
    alert(`Ошибка: ${error}`)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            🧪 Тестирование функции "Любой мастер"
          </h1>
          <p className="text-gray-600">
            Демонстрация новой функциональности для выбора "Любого мастера" в салоне
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Салон ID: {salonId}
          </h2>
          
          <SalonBookingModule
            salonId={salonId}
            onBookingSuccess={handleBookingSuccess}
            onBookingError={handleBookingError}
            title="Тестовая запись на услугу"
            showUserInfo={false}
          />
        </div>

        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">
            📋 Что тестируем:
          </h3>
          <ul className="text-blue-800 space-y-2">
            <li>✅ Порядок полей: сначала услуга, потом мастера</li>
            <li>✅ Опция "Любой мастер" вверху списка</li>
            <li>✅ Загрузка слотов через новый endpoint при выборе "Любой мастер"</li>
            <li>✅ Отображение слотов без дублей и без указания мастеров</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

