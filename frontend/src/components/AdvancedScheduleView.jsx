import React, { useState } from 'react'
import BookingOverviewCalendar from './BookingOverviewCalendar'
import PlacesManagementCalendar from './PlacesManagementCalendar'

export default function AdvancedScheduleView({
  schedule,
  bookings,
  places,
  masters,
  workingHours,
  onAssignMaster,
  onRemoveMaster
}) {
  const [viewMode, setViewMode] = useState('overview')

  return (
    <div className="space-y-4">
      {/* Переключатель режимов */}
      <div className="flex gap-2">
        <button
          onClick={() => setViewMode('overview')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'overview'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Обзор записей
        </button>
        <button
          onClick={() => setViewMode('management')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            viewMode === 'management'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Управление местами
        </button>
      </div>

      {/* Контент в зависимости от режима */}
      {viewMode === 'overview' ? (
        <BookingOverviewCalendar
          schedule={schedule}
          bookings={bookings}
          places={places}
          workingHours={workingHours}
        />
      ) : (
        <PlacesManagementCalendar
          selectedDate={new Date()}
          places={places}
          masters={masters}
          bookings={bookings}
          workingHours={workingHours}
          onAssignMaster={onAssignMaster}
          onRemoveMaster={onRemoveMaster}
        />
      )}
    </div>
  )
} 