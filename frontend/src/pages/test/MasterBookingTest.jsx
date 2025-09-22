import React from 'react'
import { MasterBookingModule } from '../../components/booking'

export default function MasterBookingTest() {
  const handleBookingSuccess = (result) => {
    console.log('Запись к мастеру успешно создана:', result)
  }

  const handleBookingError = (error) => {
    console.error('Ошибка при создании записи к мастеру:', error)
  }

  return (
    <div className="min-h-screen bg-[#F9F7F6] py-8">
      <div className="max-w-2xl mx-auto">
        <MasterBookingModule
          masterId={1}
          onBookingSuccess={handleBookingSuccess}
          onBookingError={handleBookingError}
          title="Тестовая запись к мастеру"
        />
      </div>
    </div>
  )
} 