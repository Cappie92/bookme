import React, { useState, useEffect, useRef } from 'react'
import { getWeekDates, getSlotKey } from '../utils/calendarUtils'
import { format } from 'date-fns'
import PopupCard from './PopupCard'

const HOURS = Array.from({ length: 24 }, (_, i) => i) // 00:00 - 23:00
const MINUTES = [0, 30]

export default function SalonWorkSchedule({ salonData, selectedSalon, onWeekChange }) {
  const [currentWeekOffset, setCurrentWeekOffset] = useState(0)
  const [weekDates, setWeekDates] = useState([])
  const [schedule, setSchedule] = useState({})
  const [showScrollIndicator, setShowScrollIndicator] = useState(false)
  const [bookings, setBookings] = useState([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [popupVisible, setPopupVisible] = useState(false)
  const [popupBooking, setPopupBooking] = useState(null)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })
  const tableRef = useRef(null)

  // Загружаем расписание при изменении недели или выбранного салона
  useEffect(() => {
    if (selectedSalon) {
      loadSchedule()
      loadBookings()
    }
  }, [currentWeekOffset, selectedSalon, weekDates])

  // Обновляем даты недели при изменении offset
  useEffect(() => {
    const dates = getWeekDates(currentWeekOffset)
    setWeekDates(dates)
  }, [currentWeekOffset])

  const loadSchedule = async () => {
    if (!selectedSalon) return

    try {
      const token = localStorage.getItem('access_token')
      const startDate = weekDates[0]?.date
      const endDate = weekDates[6]?.date

      if (!startDate || !endDate) {
        return
      }

      const startDateStr = format(startDate, 'yyyy-MM-dd')
      const endDateStr = format(endDate, 'yyyy-MM-dd')

      const response = await fetch(`/api/master/salon-work/schedule?salon_id=${selectedSalon.salon_id}&start_date=${startDateStr}&end_date=${endDateStr}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setSchedule(data.schedule || {})
      } else {
        console.error('Ошибка загрузки расписания салона')
        setSchedule({})
      }
    } catch (error) {
      console.error('Ошибка загрузки расписания салона:', error)
      setSchedule({})
    }
  }

  // Загружаем записи мастера
  const loadBookings = async () => {
    setBookingsLoading(true)
    try {
      const token = localStorage.getItem('access_token')
      const response = await fetch('/api/master/bookings', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        // Фильтруем только записи в салоне
        const salonBookings = data.filter(booking => booking.salon_id === selectedSalon?.salon_id)
        setBookings(salonBookings)
      }
    } catch (error) {
      console.error('Ошибка при загрузке записей:', error)
    } finally {
      setBookingsLoading(false)
    }
  }

  // Функция для получения записей для конкретного слота
  const getBookingsForSlot = (date, hour, minute) => {
    const dateStr = date.toISOString().split('T')[0]
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    
    return bookings.filter(booking => {
      const bookingDate = new Date(booking.start_time).toISOString().split('T')[0]
      const bookingTime = new Date(booking.start_time).toTimeString().slice(0, 5)
      return bookingDate === dateStr && bookingTime === timeStr
    })
  }

  // Обработчики для поп-апа
  const handleBookingMouseEnter = (booking, event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setPopupPosition({
      x: rect.left + rect.width / 2,
      y: rect.top
    })
    setPopupBooking(booking)
    setPopupVisible(true)
  }

  const handleBookingMouseLeave = () => {
    setPopupVisible(false)
    setPopupBooking(null)
  }

  const handlePopupClose = () => {
    setPopupVisible(false)
    setPopupBooking(null)
  }


  const goToPreviousWeek = () => {
    setCurrentWeekOffset(prev => prev - 1)
    onWeekChange?.(currentWeekOffset - 1)
  }

  const goToNextWeek = () => {
    setCurrentWeekOffset(prev => prev + 1)
    onWeekChange?.(currentWeekOffset + 1)
  }

  const goToCurrentWeek = () => {
    setCurrentWeekOffset(0)
    onWeekChange?.(0)
  }

  // Автопрокрутка к 8 утра при монтировании
  useEffect(() => {
    const scrollTo8AM = () => {
      if (tableRef.current) {
        const scrollPosition = 8 * 2 * 32
        tableRef.current.scrollTop = scrollPosition
      }
    }
    
    scrollTo8AM()
    setTimeout(scrollTo8AM, 50)
  }, [])

  // Прокрутка к 8 утра при обновлении расписания
  useEffect(() => {
    const scrollTo8AM = () => {
      if (tableRef.current) {
        const scrollPosition = 8 * 2 * 32
        tableRef.current.scrollTop = scrollPosition
      }
    }
    
    if (schedule) {
      scrollTo8AM()
      setTimeout(scrollTo8AM, 100)
    }
  }, [schedule])

  if (!selectedSalon) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>Выберите салон для просмотра расписания</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-x-auto bg-white mx-auto max-w-8xl px-4">
      {/* Верхняя строка: заголовок и кнопки навигации */}
      <div className="flex items-center justify-between px-6 py-2 border-b bg-gray-50 sticky top-0 z-10 -mx-4">
        <div className="font-semibold">Расписание работы в салоне</div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToPreviousWeek}
            className="p-1 rounded hover:bg-gray-200 transition-colors"
            title="Предыдущая неделя"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={goToCurrentWeek}
            className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded transition-colors"
            title="Текущая неделя"
          >
            Сегодня
          </button>
          <button
            onClick={goToNextWeek}
            className="p-1 rounded hover:bg-gray-200 transition-colors"
            title="Следующая неделя"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Вторая строка: описание */}
      <div className="flex items-center justify-center px-6 py-2 border-b bg-gray-50 -mx-4">
        <div className="text-sm text-gray-600">
          Слоты, назначенные салоном для вашей работы
        </div>
      </div>

      <div
        className="overflow-y-auto relative"
        style={{ maxHeight: 600 }}
        ref={tableRef}
      >
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              <th className="w-16 p-2 text-xs font-medium text-gray-500 border-r"></th>
              {weekDates.map((day, index) => (
                <th key={index} className="w-24 p-2 text-xs font-medium text-gray-500 border-r text-center">
                  <div className="font-semibold">{day.label.split(' ')[0]}</div>
                  <div className="text-gray-400">{day.label.split(' ')[1]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map(hour => 
              MINUTES.map(minute => (
                <tr key={`${hour}-${minute}`}>
                  <td className="p-2 text-xs text-gray-500 border-r text-center">
                    {hour.toString().padStart(2, '0')}:{minute.toString().padStart(2, '0')}
                  </td>
                  {weekDates.map((day, dayIndex) => {
                    const slotKey = getSlotKey(day.date, hour, minute)
                    const isActive = schedule?.[slotKey]
                    const slotBookings = getBookingsForSlot(day.date, hour, minute)
                    
                    return (
                      <td
                        key={slotKey}
                        className={
                          `h-8 transition-colors relative ` +
                          (isActive
                            ? 'bg-green-100'
                            : 'bg-gray-50')
                        }
                        style={{
                          border: '1px solid #E5E7EB'
                        }}
                      >
                        {/* Отображение записей в виде карточек */}
                        {slotBookings.map((booking, index) => {
                          const startTime = new Date(booking.start_time)
                          const endTime = new Date(booking.end_time)
                          const duration = (endTime - startTime) / (1000 * 60) // в минутах
                          const height = Math.max(16, (duration / 30) * 32) // высота в пикселях
                          
                          return (
                            <div
                              key={booking.id}
                              className="absolute left-0 right-0 bg-white border border-blue-300 rounded shadow-sm p-1 text-xs overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                              style={{
                                top: '1px',
                                height: `${height}px`,
                                zIndex: 10,
                                fontSize: '10px',
                                lineHeight: '1.2'
                              }}
                              onMouseEnter={(e) => handleBookingMouseEnter(booking, e)}
                              onMouseLeave={handleBookingMouseLeave}
                            >
                              <div className="font-medium text-blue-800 truncate">
                                {booking.client_name}
                              </div>
                              <div className="text-blue-600 truncate">
                                {booking.service_name}
                              </div>
                              <div className="text-gray-500 text-xs">
                                {startTime.toTimeString().slice(0, 5)}-{endTime.toTimeString().slice(0, 5)}
                              </div>
                            </div>
                          )
                        })}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Легенда цветографики */}
      <div className="flex items-center justify-center px-6 py-3 border-t bg-gray-50 -mx-4">
        <div className="flex items-center gap-6">
          <h4 className="text-sm font-medium text-gray-700">Легенда расписания:</h4>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border border-gray-200 rounded"></div>
              <span className="text-gray-600">Назначенное время</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-100 border border-gray-200 rounded"></div>
              <span className="text-gray-600">Свободное время</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Поп-ап с информацией о записи */}
      <PopupCard
        booking={popupBooking}
        position={popupPosition}
        visible={popupVisible}
        onClose={handlePopupClose}
      />
    </div>
  )
}
