import React, { useState, useEffect, useRef } from 'react'
import { apiGet } from '../utils/api'
import { useHoverCloseDelay } from '../hooks/useHoverCloseDelay'
import { getWeekDates, getSlotKey } from '../utils/calendarUtils'
import { format } from 'date-fns'
import PopupCard from './PopupCard'

const HOURS = Array.from({ length: 24 }, (_, i) => i) // 00:00 - 23:00
const MINUTES = [0, 10, 20, 30, 40, 50]

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      const data = await apiGet(`/api/master/salon-work/schedule?salon_id=${selectedSalon.salon_id}&start_date=${startDateStr}&end_date=${endDateStr}`)
      setSchedule(data.schedule || {})
    } catch (error) {
      console.error('Ошибка загрузки расписания салона:', error)
      setSchedule({})
    }
  }

  // Загружаем записи мастера
  const loadBookings = async () => {
    setBookingsLoading(true)
    try {
      const data = await apiGet('/api/master/bookings/detailed')
      // Фильтруем только записи в салоне
      const salonBookings = data.filter(booking => booking.salon_id === selectedSalon?.salon_id)
      setBookings(salonBookings)
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
  const { scheduleClose, cancelClose } = useHoverCloseDelay(500, () => {
    setPopupVisible(false)
    setPopupBooking(null)
  })

  const handleBookingMouseEnter = (booking, event) => {
    cancelClose()
    const rect = event.currentTarget.getBoundingClientRect()
    setPopupPosition({
      x: rect.left + rect.width / 2,
      y: rect.top
    })
    setPopupBooking(booking)
    setPopupVisible(true)
  }

  const handleBookingMouseLeave = () => {
    scheduleClose()
  }

  const handlePopupMouseEnter = () => {
    cancelClose()
  }

  const handlePopupMouseLeave = () => {
    scheduleClose()
  }

  const handlePopupClose = () => {
    cancelClose()
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
    <div className="mx-auto max-w-full overflow-hidden rounded-lg border bg-white px-2 sm:px-4 lg:max-w-8xl">
      {/* Верхняя строка: заголовок и кнопки навигации */}
      <div className="sticky top-0 z-10 -mx-2 flex min-h-12 items-center justify-between gap-2 border-b bg-gray-50 px-3 py-2 sm:-mx-4 sm:px-6">
        <div className="min-w-0 truncate text-sm font-semibold sm:text-base">Расписание работы в салоне</div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={goToPreviousWeek}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg hover:bg-gray-200 transition-colors lg:min-h-0 lg:min-w-0 lg:p-1"
            title="Предыдущая неделя"
            aria-label="Предыдущая неделя"
          >
            <svg className="h-5 w-5 lg:h-4 lg:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goToCurrentWeek}
            className="min-h-10 rounded-lg bg-gray-200 px-3 py-2 text-xs transition-colors hover:bg-gray-300 lg:min-h-0 lg:px-2 lg:py-1"
            title="Текущая неделя"
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={goToNextWeek}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg hover:bg-gray-200 transition-colors lg:min-h-0 lg:min-w-0 lg:p-1"
            title="Следующая неделя"
            aria-label="Следующая неделя"
          >
            <svg className="h-5 w-5 lg:h-4 lg:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Вторая строка: описание */}
      <div className="-mx-2 flex items-center justify-center border-b bg-gray-50 px-3 py-2 sm:-mx-4 sm:px-6">
        <div className="text-center text-xs text-gray-600 sm:text-sm">
          Слоты, назначенные салоном для вашей работы
        </div>
      </div>

      <div
        className="relative max-h-[min(58vh,560px)] overflow-auto overscroll-contain touch-pan-x lg:max-h-[600px]"
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
                          const height = Math.max(16, (duration / 10) * 24) // высота в пикселях для 10-минутных слотов
                          
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
                                {(booking.client_display_name || booking.client_name) || 'Клиент'}
                              </div>
                              {booking.client_phone && (
                                <div className="text-gray-500 text-[10px] truncate">{booking.client_phone}</div>
                              )}
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
      <div className="-mx-2 border-t bg-gray-50 px-3 py-3 sm:-mx-4 sm:px-6">
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-2">
          <h4 className="text-sm font-medium text-gray-700">Легенда расписания:</h4>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border border-gray-200 bg-green-100" />
              <span className="text-gray-600">Назначенное время</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 rounded border border-gray-200 bg-gray-100" />
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
        onMouseEnter={handlePopupMouseEnter}
        onMouseLeave={handlePopupMouseLeave}
      />
    </div>
  )
}
