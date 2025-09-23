import React, { useState, useEffect } from 'react'
import { XMarkIcon, CalendarIcon, ClockIcon, UserIcon, TagIcon } from '@heroicons/react/24/outline'
import { apiGet } from '../utils/api'
import Calendar from '../components/ui/Calendar'
import { useModal } from '../hooks/useModal'

export default function RepeatBookingModal({ 
  isOpen, 
  onClose, 
  booking,
  onBookingSuccess 
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [availableSlots, setAvailableSlots] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [salonInfo, setSalonInfo] = useState(null)
  const [masterInfo, setMasterInfo] = useState(null)
  const [serviceInfo, setServiceInfo] = useState(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const [availableDates, setAvailableDates] = useState([])
  const [calendarLoading, setCalendarLoading] = useState(false)

  useEffect(() => {
    if (isOpen && booking) {
      loadBookingDetails()
    }
  }, [isOpen, booking])

  // Загружаем доступные даты при изменении месяца
  useEffect(() => {
    if (serviceInfo?.duration) {
      const currentMonth = new Date()
      loadAvailableDatesForMonth(currentMonth)
    }
  }, [serviceInfo])

  // Закрываем календарь при клике вне его
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showCalendar && !event.target.closest('.calendar-container')) {
        setShowCalendar(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showCalendar])

  const loadBookingDetails = async () => {
    try {
      setLoading(true)
      setError('')

      // Загружаем информацию об услуге
      if (booking.service_id) {
        const serviceResponse = await apiGet(`/client/bookings/service/${booking.service_id}/profile`)
        setServiceInfo(serviceResponse)
      }

      // Загружаем информацию о салоне
      if (booking.salon_id) {
        const salonResponse = await apiGet(`/salon/profile/public?salon_id=${booking.salon_id}`)
        setSalonInfo(salonResponse)
      }

      // Загружаем информацию о мастере
      if (booking.master_id) {
        const masterResponse = await apiGet(`/client/master/${booking.master_id}/profile`)
        setMasterInfo(masterResponse)
      } else if (booking.indie_master_id) {
        const masterResponse = await apiGet(`/client/indie-master/${booking.indie_master_id}/profile`)
        setMasterInfo(masterResponse)
      }

      // Устанавливаем минимальную дату (завтра)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setSelectedDate(tomorrow.toISOString().split('T')[0])

    } catch (error) {
      console.error('Ошибка загрузки деталей записи:', error)
      setError('Не удалось загрузить детали записи')
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableSlots = async () => {
    if (!selectedDate) return
    
    try {
      // Определяем тип владельца и ID
      let ownerType = ''
      let ownerId = 0
      
      if (booking.salon_id) {
        ownerType = 'salon'
        ownerId = booking.salon_id
      } else if (booking.indie_master_id) {
        ownerType = 'indie_master'
        ownerId = booking.indie_master_id
      }
      
      // Получаем длительность услуги
      const serviceDuration = serviceInfo?.duration || 60
      
      // Преобразуем строку даты в объект Date
      const dateObj = new Date(selectedDate)
      const year = dateObj.getFullYear()
      const month = dateObj.getMonth() + 1
      const day = dateObj.getDate()
      
      const response = await apiGet(
        `/bookings/available-slots-repeat?owner_type=${ownerType}&owner_id=${ownerId}&year=${year}&month=${month}&day=${day}&service_duration=${serviceDuration}`
      )
      
      setAvailableSlots(response)
    } catch (error) {
      console.error('Ошибка загрузки доступных слотов:', error)
      setError('Не удалось загрузить доступные слоты')
    }
  }

  const loadAvailableDatesForMonth = async (month) => {
    if (!serviceInfo?.duration) return
    
    setCalendarLoading(true)
    try {
      // Определяем тип владельца и ID
      let ownerType = ''
      let ownerId = 0
      
      if (booking.salon_id) {
        ownerType = 'salon'
        ownerId = booking.salon_id
      } else if (booking.indie_master_id) {
        ownerType = 'indie_master'
        ownerId = booking.indie_master_id
      }
      
      const serviceDuration = serviceInfo.duration
      const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
      const availableDatesList = []
      
      // Проверяем доступность для каждого дня месяца
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(month.getFullYear(), month.getMonth(), day)
        const dateStr = date.toISOString().split('T')[0]
        
        // Пропускаем прошедшие даты
        if (date < new Date()) continue
        
        try {
          const response = await apiGet(
            `/bookings/available-slots-repeat?owner_type=${ownerType}&owner_id=${ownerId}&year=${date.getFullYear()}&month=${date.getMonth() + 1}&day=${date.getDate()}&service_duration=${serviceDuration}`
          )
          
          if (response && response.length > 0) {
            availableDatesList.push(date)
          }
        } catch (error) {
          console.error(`Ошибка проверки даты ${dateStr}:`, error)
        }
      }
      
      setAvailableDates(availableDatesList)
    } catch (error) {
      console.error('Ошибка загрузки доступных дат:', error)
    } finally {
      setCalendarLoading(false)
    }
  }

  useEffect(() => {
    if (selectedDate) {
      loadAvailableSlots()
    }
  }, [selectedDate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!selectedDate || !selectedTime) {
      setError('Выберите дату и время')
      return
    }

    try {
      setLoading(true)
      setError('')

      const bookingData = {
        service_id: booking.service_id,
        date: selectedDate,
        time: selectedTime,
        notes: `Повторная запись от ${new Date().toLocaleDateString('ru-RU')}`
      }

      if (booking.salon_id) {
        // Запись в салон
        if (booking.branch_id) {
          bookingData.branch_id = booking.branch_id
        }
        if (booking.master_id) {
          bookingData.master_id = booking.master_id
        }
        
        const response = await fetch(`/salon/${booking.salon_id}/book`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify(bookingData)
        })

        if (response.ok) {
          const result = await response.json()
          onBookingSuccess(result)
          onClose()
        } else {
          const errorData = await response.json()
          setError(errorData.detail || 'Ошибка при создании записи')
        }
      } else if (booking.indie_master_id) {
        // Запись к индивидуальному мастеру
        const response = await fetch(`/indie-master/${booking.indie_master_id}/book`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify(bookingData)
        })

        if (response.ok) {
          const result = await response.json()
          onBookingSuccess(result)
          onClose()
        } else {
          const errorData = await response.json()
          setError(errorData.detail || 'Ошибка при создании записи')
        }
      }

    } catch (error) {
      console.error('Ошибка при создании записи:', error)
      setError('Ошибка при создании записи')
    } finally {
      setLoading(false)
    }
  }

  const { handleBackdropClick, handleMouseDown } = useModal(onClose)

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
    >
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Повторить запись</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Загрузка...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Информация о записи */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3">Детали записи</h3>
              
              {salonInfo && (
                <div className="flex items-center mb-2">
                  <TagIcon className="w-4 h-4 text-blue-600 mr-2" />
                  <span className="text-sm text-gray-600">
                    {salonInfo.name}
                    {booking.branch_name && ` - ${booking.branch_name}`}
                  </span>
                </div>
              )}

              {masterInfo && (
                <div className="flex items-center mb-2">
                  <UserIcon className="w-4 h-4 text-green-600 mr-2" />
                  <span className="text-sm text-gray-600">{masterInfo.name}</span>
                </div>
              )}

              {serviceInfo && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <TagIcon className="h-4 w-4 text-purple-500" />
                  <span>{serviceInfo.name} - {serviceInfo.duration} мин</span>
                </div>
              )}
            </div>

            {/* Выбор даты */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Дата записи
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowCalendar(!showCalendar)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-left flex justify-between items-center"
                >
                  <span>
                    {selectedDate ? new Date(selectedDate).toLocaleDateString('ru-RU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : 'Выберите дату'}
                  </span>
                  <CalendarIcon className="w-5 h-5 text-gray-400" />
                </button>
                
                {/* Выпадающий календарь */}
                {showCalendar && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-10 calendar-container">
                    <Calendar
                      selectedDate={selectedDate ? new Date(selectedDate) : null}
                      onDateSelect={(date) => {
                        setSelectedDate(date.toISOString().split('T')[0])
                        setShowCalendar(false)
                        // Загружаем доступные слоты для выбранной даты
                        setTimeout(() => loadAvailableSlots(), 100)
                      }}
                      availableDates={availableDates}
                      className="shadow-lg border border-gray-300"
                    />
                  </div>
                )}
              </div>
              
              {calendarLoading && (
                <p className="text-xs text-gray-500 mt-1">
                  Загрузка доступности дат...
                </p>
              )}
            </div>

            {/* Выбор времени */}
            {availableSlots.length > 0 ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Доступное время
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {availableSlots.map((slot, index) => {
                    // Извлекаем только время из start_time
                    let timeDisplay = ''
                    if (slot.start_time) {
                      const time = new Date(slot.start_time)
                      timeDisplay = time.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      })
                    } else if (typeof slot === 'string') {
                      // Если slot - это строка времени
                      timeDisplay = slot
                    } else {
                      timeDisplay = 'Время'
                    }
                    
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setSelectedTime(slot.start_time || slot)}
                        className={`p-2 text-sm rounded-lg border transition-colors ${
                          selectedTime === (slot.start_time || slot)
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-500'
                        }`}
                      >
                        {timeDisplay}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-500 text-sm">
                  На выбранную дату нет доступных слотов. 
                  Попробуйте выбрать другой день.
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Кнопки */}
            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={loading || !selectedDate || !selectedTime}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Создание...' : 'Записаться'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
