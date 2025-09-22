import { useState, useEffect } from "react"

const dayMapping = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
]

function parseWorkingHours(workingHours) {
  if (!workingHours) return null
  if (typeof workingHours === 'string') {
    try {
      return JSON.parse(workingHours)
    } catch {
      return null
    }
  }
  return workingHours
}

export default function PlaceCalendarModal({ isOpen, onClose, place, onEdit, onDelete, salonScheduleData, workingHours }) {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [loading, setLoading] = useState(false)

  // Гарантируем объект
  const parsedWorkingHours = parseWorkingHours(workingHours)

  // Используем общее расписание салона вместо отдельного запроса
  const getPlaceSchedule = () => {
    if (!salonScheduleData || !place) return null
    // Фильтруем данные для конкретного места
    const placeBookings = salonScheduleData.bookings?.filter(booking => 
      booking.place_id === place.id
    ) || []
    return {
      bookings: placeBookings,
      date: selectedDate.toISOString().split('T')[0]
    }
  }
  const scheduleData = getPlaceSchedule()

  useEffect(() => {
    if (isOpen && place) {
      setLoading(false)
    }
  }, [isOpen, place, selectedDate, salonScheduleData])

  const formatDate = (date) => {
    return date.toLocaleDateString('ru-RU', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const navigateDate = (direction) => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + direction)
    setSelectedDate(newDate)
  }

  // Генерация тайм-слотов по рабочим часам
  let timeSlots = []
  let isDayOff = false
  if (parsedWorkingHours) {
    const dayKey = dayMapping[selectedDate.getDay()]
    const dayData = parsedWorkingHours[dayKey]
    if (dayData && dayData.enabled) {
      const [startHour, startMinute] = dayData.open.split(":").map(Number)
      const [endHour, endMinute] = dayData.close.split(":").map(Number)
      let currentHour = startHour
      let currentMinute = startMinute
      while (currentHour < endHour || (currentHour === endHour && currentMinute < endMinute)) {
        timeSlots.push(`${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`)
        currentMinute += 30
        if (currentMinute >= 60) {
          currentMinute = 0
          currentHour += 1
        }
      }
    } else {
      isDayOff = true
    }
  }

  if (!isOpen || !place) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Календарь места: {place.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl">×</button>
        </div>
        {/* Навигация по дням */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigateDate(-1)}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition-colors"
          >
            ← Предыдущий день
          </button>
          <div className="text-lg font-semibold">
            {formatDate(selectedDate)}
          </div>
          <button
            onClick={() => navigateDate(1)}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 transition-colors"
          >
            Следующий день →
          </button>
        </div>
        {/* Расписание по часам */}
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Расписание на день</h3>
          {!salonScheduleData ? (
            <div className="text-center py-8 text-gray-500">Расписание не загружено</div>
          ) : isDayOff ? (
            <div className="text-center py-8 text-gray-500">В этот день салон не работает</div>
          ) : timeSlots.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Нет рабочих слотов</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="grid grid-cols-1 gap-1">
                {timeSlots.map(time => {
                  const isBooked = scheduleData?.bookings?.some(booking => 
                    booking.time === time
                  )
                  return (
                    <div
                      key={time}
                      className={`p-3 border-b ${
                        isBooked 
                          ? 'bg-red-50 border-red-200' 
                          : 'bg-green-50 border-green-200'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{time}</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          isBooked 
                            ? 'bg-red-200 text-red-800' 
                            : 'bg-green-200 text-green-800'
                        }`}>
                          {isBooked ? 'Занято' : 'Свободно'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        {/* Кнопки действий */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            onClick={() => onEdit(place)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Редактировать
          </button>
          <button
            onClick={() => onDelete(place)}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  )
} 