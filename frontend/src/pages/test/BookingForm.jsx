import React from 'react'
import { SalonBookingModule } from '../../components/booking'

export default function BookingForm() {
  const handleBookingSuccess = (result) => {
    console.log('Запись успешно создана:', result)
  }

  const handleBookingError = (error) => {
    console.error('Ошибка при создании записи:', error)
  }

  return (
    <div className="min-h-screen bg-[#F9F7F6] py-8">
      <div className="max-w-2xl mx-auto">
        <SalonBookingModule
          salonId={1}
          onBookingSuccess={handleBookingSuccess}
          onBookingError={handleBookingError}
          title="Тестовая запись в салон"
        />
      </div>
    </div>
  )
} 