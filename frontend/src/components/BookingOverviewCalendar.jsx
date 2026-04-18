import React, { useState, useRef } from 'react'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 10, 20, 30, 40, 50]

// Функция для получения дат текущей недели
function getCurrentWeekDates(weekOffset = 0) {
  const today = new Date()
  const currentDay = today.getDay()
  
  // Находим понедельник текущей недели
  const monday = new Date(today)
  const daysToMonday = currentDay === 0 ? 6 : currentDay - 1
  monday.setDate(today.getDate() - daysToMonday)
  
  // Добавляем смещение недели
  monday.setDate(monday.getDate() + (weekOffset * 7))
  
  const weekDates = []
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    weekDates.push({
      date: date,
      dayOfWeek: date.getDay(),
      label: date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
    })
  }
  
  return weekDates
}

function getTimeLabel(hour, minute) {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
}

function getSlotKey(date, hour, minute) {
  return `${date.toISOString().split('T')[0]}_${hour}_${minute}`
}

// Функция для определения цвета загруженности
function getLoadColor(bookings, totalPlaces, isPast) {
  if (!bookings || bookings.length === 0) {
    return isPast ? 'bg-green-50' : 'bg-green-100' // Прошедшие свободные - светлый зеленый
  }
  if (!totalPlaces || totalPlaces === 0) {
    return isPast ? 'bg-gray-50' : 'bg-gray-100'
  }
  
  const occupancyRate = bookings.length / totalPlaces
  
  if (occupancyRate < 0.5) {
    return isPast ? 'bg-yellow-50' : 'bg-yellow-100' // Менее 50% - желтый
  }
  return isPast ? 'bg-pink-50' : 'bg-pink-100' // Более 50% - розовый
}

export default function BookingOverviewCalendar({ schedule, bookings, places, workingHours }) {
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedTime, setSelectedTime] = useState(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const tableRef = useRef(null)
  
  const weekDates = getCurrentWeekDates(weekOffset)
  const today = new Date()

  // Парсинг рабочих часов
  const parseWorkingHours = (workingHours) => {
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

  const parsedWorkingHours = parseWorkingHours(workingHours)
  const dayMapping = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

  // Проверка, является ли слот рабочим
  const isWorkingSlot = (date, hour, minute) => {
    if (!parsedWorkingHours) return false
    
    const dayKey = dayMapping[date.getDay()]
    const dayData = parsedWorkingHours[dayKey]
    
    if (!dayData || !dayData.enabled) return false
    
    const [startHour, startMinute] = dayData.open.split(":").map(Number)
    const [endHour, endMinute] = dayData.close.split(":").map(Number)
    
    const slotTime = hour * 60 + minute
    const startTime = startHour * 60 + startMinute
    const endTime = endHour * 60 + endMinute
    
    return slotTime >= startTime && slotTime < endTime
  }

  // Получение бронирований для слота
  const getSlotBookings = (date, hour, minute) => {
    if (!bookings) return []
    
    const dateStr = date.toISOString().split('T')[0]
    const timeStr = getTimeLabel(hour, minute)
    
    return bookings.filter(booking => 
      booking.date === dateStr && booking.time === timeStr
    )
  }

  // Проверка, является ли слот прошедшим
  const isPastSlot = (date, hour, minute) => {
    const slotDate = new Date(date)
    slotDate.setHours(hour, minute, 0, 0)
    return slotDate < today
  }

  // Генерация динамического диапазона времени для недели
  const getWeekTimeRange = () => {
    if (!parsedWorkingHours) return { startHour: 9, endHour: 18 }
    
    let earliestHour = 23
    let latestHour = 0
    
    weekDates.forEach(dayData => {
      const dayKey = dayMapping[dayData.date.getDay()]
      const dayData_working = parsedWorkingHours[dayKey]
      
      if (dayData_working && dayData_working.enabled) {
        const [startHour] = dayData_working.open.split(":").map(Number)
        const [endHour] = dayData_working.close.split(":").map(Number)
        
        earliestHour = Math.min(earliestHour, startHour)
        latestHour = Math.max(latestHour, endHour)
      }
    })
    
    // Если нет рабочих дней, возвращаем дефолтный диапазон
    if (earliestHour === 23 && latestHour === 0) {
      return { startHour: 9, endHour: 18 }
    }
    
    return { startHour: earliestHour, endHour: latestHour }
  }

  // Обработка клика по слоту
  const handleSlotClick = (date, hour, minute) => {
    const bookings = getSlotBookings(date, hour, minute)
    setSelectedDate(date)
    setSelectedTime(getTimeLabel(hour, minute))
    
    console.log(`Слот ${date.toLocaleDateString()} ${getTimeLabel(hour, minute)}:`)
    console.log(`- Бронирования: ${bookings.length}`)
    console.log(`- Мест в салоне: ${places?.length || 0}`)
    bookings.forEach(booking => {
      console.log(`  * ${booking.client_name} - ${booking.service_name} (${booking.place_name})`)
    })
  }

  // Навигация по неделям
  const navigateWeek = (direction) => {
    setWeekOffset(prev => prev + direction)
  }

  // Автопрокрутка к началу рабочего времени при монтировании
  React.useEffect(() => {
    if (tableRef.current) {
      const { startHour } = getWeekTimeRange()
      tableRef.current.scrollTop = startHour * 32 // 32px — высота строки
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset])

  const { startHour, endHour } = getWeekTimeRange()
  const timeSlots = []
  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute of MINUTES) {
      timeSlots.push({ hour, minute })
    }
  }

  return (
    <div className="border rounded-lg overflow-x-auto bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigateWeek(-1)}
            className="bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 transition-colors"
          >
            ←
          </button>
          <div className="font-semibold text-lg">Обзор записей</div>
          <button
            onClick={() => navigateWeek(1)}
            className="bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 transition-colors"
          >
            →
          </button>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300"></div>
            <span>Свободно</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-300"></div>
            <span>&lt; 50% занято</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-pink-100 border border-pink-300"></div>
            <span>&gt; 50% занято</span>
          </div>
        </div>
      </div>
      
      <div
        className="overflow-y-auto"
        style={{ maxHeight: 600 }}
        ref={tableRef}
      >
        <table className="min-w-full select-none">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              <th className="w-16"></th>
              {weekDates.map(day => (
                <th
                  key={day.date.toISOString().split('T')[0]}
                  className="text-center px-2 py-1 text-sm font-semibold text-gray-700"
                >
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map(({ hour, minute }) => (
              <tr key={hour + ':' + minute} style={{ height: 32 }}>
                <td className="text-xs text-gray-500 text-right pr-2">
                  {getTimeLabel(hour, minute)}
                </td>
                {weekDates.map(day => {
                  const isWorking = isWorkingSlot(day.date, hour, minute)
                  const isPast = isPastSlot(day.date, hour, minute)
                  const slotBookings = getSlotBookings(day.date, hour, minute)
                  const totalPlaces = places?.length || 0
                  const loadColor = getLoadColor(slotBookings, totalPlaces, isPast)
                  
                  return (
                    <td
                      key={`${day.date.toISOString().split('T')[0]}_${hour}_${minute}`}
                      className={
                        `border border-gray-200 w-12 h-8 cursor-pointer transition-colors ` +
                        (isWorking ? loadColor : 'bg-gray-50') +
                        (isPast ? ' opacity-80' : ' hover:opacity-80')
                      }
                      onClick={() => handleSlotClick(day.date, hour, minute)}
                      title={
                        isWorking 
                          ? `${slotBookings.length} записей из ${totalPlaces} мест`
                          : 'Не рабочий слот'
                      }
                    >
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Информация о выбранном слоте */}
      {selectedDate && selectedTime && (
        <div className="border-t bg-gray-50 px-4 py-2">
          <div className="text-sm">
            <strong>{selectedDate.toLocaleDateString('ru-RU')} {selectedTime}</strong>
            {(() => {
              const bookings = getSlotBookings(selectedDate, parseInt(selectedTime.split(':')[0]), parseInt(selectedTime.split(':')[1]))
              return (
                <div className="mt-1">
                  <span className="text-gray-600">
                    {bookings.length} записей из {places?.length || 0} мест
                  </span>
                  {bookings.length > 0 && (
                    <div className="mt-1 text-xs">
                      {bookings.map((booking, index) => (
                        <div key={index} className="text-gray-500">
                          • {booking.client_name} - {booking.service_name} ({booking.place_name})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
} 