import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiFetch } from '../utils/api'
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline"
import PasswordSetupModal from "../modals/PasswordSetupModal"
import ManagerInvitations from "../components/ManagerInvitations"
import ClientDashboardStats from "../components/ClientDashboardStats"
import RepeatBookingModal from "../modals/RepeatBookingModal"
import ClientNoteModal from '../modals/ClientNoteModal'

// Вспомогательные функции
function formatDate(dateStr) {
  // Создаем дату из ISO строки и форматируем в локальном времени
  const d = new Date(dateStr)
  
  // Проверяем, что дата валидна
  if (isNaN(d.getTime())) {
    console.error('Неверная дата:', dateStr)
    return 'Неверная дата'
  }
  
  // Форматируем в локальном времени
  return d.toLocaleString("ru-RU", { 
    day: "2-digit", 
    month: "2-digit", 
    year: "numeric", 
    hour: "2-digit", 
    minute: "2-digit",
    timeZone: 'Europe/Moscow'  // Явно указываем часовой пояс
  })
}

function getBookingStatusLabel(status) {
  const statusLabels = {
    'pending': 'Ожидает подтверждения',
    'confirmed': 'Подтверждено',
    'cancelled': 'Отменено',
    'completed': 'Завершено'
  }
  return statusLabels[status] || status
}

function getBookingStatusColor(status) {
  const statusColors = {
    'pending': 'bg-yellow-100 text-yellow-800',
    'confirmed': 'bg-green-100 text-green-800',
    'cancelled': 'bg-red-100 text-red-800',
    'completed': 'bg-blue-100 text-blue-800'
  }
  return statusColors[status] || 'bg-gray-100 text-gray-800'
}

function renderFavoriteCard(favorite) {
  // Функция для отображения карточки избранного
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div className="text-sm text-gray-600 mb-2">
        {favorite.type === 'salon' ? 'Салон' : 
         favorite.type === 'master' ? 'Мастер' : 
         favorite.type === 'service' ? 'Услуга' : 'Избранное'}
      </div>
      <div className="font-medium text-gray-900 mb-2">
        {favorite.name || 'Название не указано'}
      </div>
      {favorite.description && (
        <div className="text-sm text-gray-600 mb-3">
          {favorite.description}
        </div>
      )}
      <button className="w-full px-3 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors text-sm">
        Убрать из избранного
      </button>
    </div>
  )
}

export default function ClientDashboard() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [futureBookings, setFutureBookings] = useState([])
  const [futureLoading, setFutureLoading] = useState(true)
  const [favorites, setFavorites] = useState([])
  const [favoritesLoading, setFavoritesLoading] = useState(true)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState(null)
  const [managedBranches, setManagedBranches] = useState([])
  const [showEditBookingModal, setShowEditBookingModal] = useState(false)
  const [showDeleteBookingModal, setShowDeleteBookingModal] = useState(false)
  const [dashboardStats, setDashboardStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [showTimeEditModal, setShowTimeEditModal] = useState(false)
  const [newDateTime, setNewDateTime] = useState('')
  const [timeEditLoading, setTimeEditLoading] = useState(false)
  const [availableSlots, setAvailableSlots] = useState([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [dateAvailability, setDateAvailability] = useState({})
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [loadingDates, setLoadingDates] = useState(new Set())
  const [showCalendar, setShowCalendar] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const navigate = useNavigate()
  const [showRepeatBookingModal, setShowRepeatBookingModal] = useState(false)
  const [selectedRepeatBooking, setSelectedRepeatBooking] = useState(null)
  const [showAllFutureBookingsModal, setShowAllFutureBookingsModal] = useState(false)
  const [showAllPastBookingsModal, setShowAllPastBookingsModal] = useState(false)
  const [allFutureBookings, setAllFutureBookings] = useState([])
  const [allPastBookings, setAllPastBookings] = useState([])
  const [allFutureLoading, setAllFutureLoading] = useState(false)
  const [allPastLoading, setAllPastLoading] = useState(false)
  const [showClientNoteModal, setShowClientNoteModal] = useState(false)
  const [selectedNoteBooking, setSelectedNoteBooking] = useState(null)

  // Отладочная информация для изменений состояния
  useEffect(() => {
    // selectedBooking изменился
  }, [selectedBooking])
  
  useEffect(() => {
    // dateAvailability изменился
  }, [dateAvailability])

  const getAuthHeaders = () => {
    const token = localStorage.getItem('access_token')
    const headers = {
      'Content-Type': 'application/json'
    }
    
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
    
    return headers
  }

  // Создаем одну функцию для обработчика beforeunload
  const beforeUnloadHandler = (e) => {
    e.preventDefault()
    e.returnValue = 'Без регистрации бронирование не сохранится, вы уверены что хотите закрыть окно?'
    return 'Без регистрации бронирование не сохранится, вы уверены что хотите закрыть окно?'
  }

  // Функция для удаления обработчика beforeunload
  const removeBeforeUnloadHandler = () => {
    window.removeEventListener('beforeunload', beforeUnloadHandler)
  }

  // Функция для загрузки данных личного кабинета
  const loadDashboardData = async () => {
    try {
      setFutureLoading(true)
      setLoading(true)
      
      // Загружаем будущие записи
      const futureData = await apiGet('client/bookings/')
      setFutureBookings(Array.isArray(futureData) ? futureData : (futureData?.bookings || []))
      setFutureLoading(false)
      
      // Загружаем прошедшие записи
      const pastData = await apiGet('client/bookings/past')
      setBookings(Array.isArray(pastData) ? pastData : (pastData?.bookings || []))
      setLoading(false)
    } catch (error) {
      console.error('Ошибка при загрузке данных:', error)
    } finally {
      // В любом случае снимаем индикаторы загрузки, чтобы отобразить содержимое
      setFutureLoading(false)
      setLoading(false)
      setFavoritesLoading(false)
    }
  }

  // Функция для загрузки всех будущих записей
  const loadAllFutureBookings = async () => {
    try {
      setAllFutureLoading(true)
      const data = await apiGet('client/bookings/')
      setAllFutureBookings(data)
    } catch (error) {
      console.error('Ошибка при загрузке всех будущих записей:', error)
    } finally {
      setAllFutureLoading(false)
    }
  }

  // Функция для загрузки всех прошедших записей
  const loadAllPastBookings = async () => {
    try {
      setAllPastLoading(true)
      const data = await apiGet('client/bookings/past')
      setAllPastBookings(data)
    } catch (error) {
      console.error('Ошибка при загрузке всех прошедших записей:', error)
    } finally {
      setAllPastLoading(false)
    }
  }

  useEffect(() => {
    // Проверяем, есть ли токен
    const token = localStorage.getItem('access_token')
    
    if (!token) {
      navigate('/')
      return
    }
    
    // Проверяем, нужно ли показать модальное окно для установки пароля
    const newClientSetup = localStorage.getItem('new_client_setup')
    const existingClientVerification = localStorage.getItem('existing_client_verification')
    
    if (newClientSetup === 'true') {
      setShowPasswordModal(true)
      
      // Добавляем обработчик события beforeunload для предупреждения при закрытии вкладки
      window.addEventListener('beforeunload', beforeUnloadHandler)
      
      // Удаляем обработчик при размонтировании компонента
      return () => {
        window.removeEventListener('beforeunload', beforeUnloadHandler)
      }
    } else if (existingClientVerification === 'true') {
      setShowPasswordModal(true)
      
      // Добавляем обработчик события beforeunload для предупреждения при закрытии вкладки
      window.addEventListener('beforeunload', beforeUnloadHandler)
      
      // Удаляем обработчик при размонтировании компонента
      return () => {
        window.removeEventListener('beforeunload', beforeUnloadHandler)
      }
    }

    // Очистка обработчика beforeunload при размонтировании
    return () => {
      removeBeforeUnloadHandler()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  useEffect(() => {
    loadDashboardData()
  }, [])

  function renderFavoriteCard(favorite) {
    const { type } = favorite
    
    if (type === 'salon_master_service') {
      return (
        <div className="bg-white rounded-lg shadow-md p-4 border hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
              {favorite.salon_name.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900 truncate">{favorite.salon_name}</div>
              <div className="text-sm text-gray-600 truncate">{favorite.master_name}</div>
              <div className="text-sm text-gray-500 truncate">{favorite.service_name}</div>
            </div>
          </div>
        </div>
      )
    }
    
    if (type === 'salon_service') {
      return (
        <div className="bg-white rounded-lg shadow-md p-4 border hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold text-lg">
              {favorite.salon_name.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900 truncate">{favorite.salon_name}</div>
              <div className="text-sm text-gray-600 truncate">{favorite.service_name}</div>
              <div className="text-sm text-gray-500 truncate">60 мин</div>
            </div>
          </div>
        </div>
      )
    }
    
    if (type === 'indie_service') {
      return (
        <div className="bg-white rounded-lg shadow-md p-4 border hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-4">
            <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold text-lg">
              {favorite.indie_master_name.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900 truncate">{favorite.indie_master_name}</div>
              <div className="text-sm text-gray-600 truncate">{favorite.service_name}</div>
              <div className="text-sm text-gray-500 truncate">60 мин</div>
            </div>
          </div>
        </div>
      )
    }
    
    return null
  }

  const handlePasswordSuccess = () => {
    // Обновляем данные после успешной установки/проверки пароля
    console.log('Пароль успешно установлен/проверен, обновляем данные')
    
    // Удаляем обработчик beforeunload
    removeBeforeUnloadHandler()
    
    // Удаляем флаги
    localStorage.removeItem('new_client_setup')
    localStorage.removeItem('existing_client_verification')
    
    // Закрываем модальное окно
    setShowPasswordModal(false)
    
    // Обновляем данные
    loadDashboardData()
    
    // Используем navigate вместо window.location.href
    navigate('/client')
  }

  const handlePasswordClose = () => {
    setShowPasswordModal(false)
    
    // Удаляем обработчик beforeunload
    removeBeforeUnloadHandler()
    
    // Удаляем флаги, чтобы модальное окно больше не показывалось
    localStorage.removeItem('new_client_setup')
    localStorage.removeItem('existing_client_verification')
  }

  const handleEditBooking = (booking) => {
    setSelectedBooking(booking)
    setShowEditBookingModal(true)
  }

  const handleDeleteBooking = (booking) => {
    setSelectedBooking(booking)
    setShowDeleteBookingModal(true)
  }

  const handleDeleteBookingConfirm = async () => {
    if (!selectedBooking) return
    
    try {
      const response = await apiFetch(`client/bookings/${selectedBooking.id}/cancel`, {
        method: 'PUT',
        headers: getAuthHeaders()
      })
      
      if (response.ok) {
        // Обновляем список бронирований
        setFutureBookings(futureBookings.filter(b => b.id !== selectedBooking.id))
        setShowDeleteBookingModal(false)
        setSelectedBooking(null)
      } else {
        console.error('Ошибка при отмене бронирования')
      }
    } catch (error) {
      console.error('Ошибка при отмене бронирования:', error)
    }
  }

  const handleTimeEdit = async () => {
    if (!selectedBooking) return
    
    setShowTimeEditModal(true)
    // TODO: setSelectedMonth was removed, need to restore if needed
    // setSelectedMonth(new Date(selectedBooking.date))
    setSelectedDate(selectedBooking.date)
    
    // Загружаем доступность для месяца записи
    await loadDateAvailabilityForMonth(new Date(selectedBooking.date))
  }

  const loadAvailableSlots = async (date) => {
    if (!selectedBooking || !date) return
    
    setSlotsLoading(true)
    setAvailableSlots([])
    
    try {
      const url = `/client/bookings/${selectedBooking.id}/available-slots?date=${date}`
      const response = await fetch(url, {
        headers: getAuthHeaders()
      })
      
      if (response.ok) {
        const data = await response.json()
        setAvailableSlots(data.available_slots || [])
      } else {
        console.error('Ошибка при загрузке слотов:', response.status)
      }
    } catch (error) {
      console.error('Ошибка при загрузке слотов:', error)
    } finally {
      setSlotsLoading(false)
    }
  }

  const loadDateAvailabilityForMonth = async (month) => {
    if (!selectedBooking) return
    
    setAvailabilityLoading(true)
    const availability = {}
    
    try {
      // Проверяем доступность для указанного месяца
      const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
      const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
      const promises = []
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day)
        const dateStr = date.toISOString().split('T')[0]
        
        // Пропускаем прошедшие даты
        if (date < new Date()) {
          continue
        }
        
        const promise = apiFetch(`client/bookings/${selectedBooking.id}/available-slots?date=${dateStr}`, {
          headers: getAuthHeaders()
        })
        .then(response => {
          if (response.ok) {
            return response.json().then(data => {
              const hasSlots = data.available_slots && data.available_slots.length > 0
              return {
                date: dateStr,
                hasSlots: hasSlots
              }
            })
          } else {
            return { date: dateStr, hasSlots: false }
          }
        }).catch((error) => {
          return { date: dateStr, hasSlots: false }
        })
        
        promises.push(promise)
      }
      
      // Выполняем все запросы параллельно
      const results = await Promise.all(promises)
      
      // Формируем объект доступности
      results.forEach(result => {
        availability[result.date] = result.hasSlots
      })
      
      setDateAvailability(availability)
    } catch (error) {
      console.error('Ошибка при загрузке доступности дат для месяца:', error)
    } finally {
      setAvailabilityLoading(false)
    }
  }

  const loadDateAvailability = async () => {
    if (!selectedBooking) return
    
    // Используем новую функцию с текущим месяцем
    await loadDateAvailabilityForMonth(currentMonth || new Date())
  }

  const changeMonth = async (direction) => {
    const newMonth = new Date(currentMonth)
    newMonth.setMonth(currentMonth.getMonth() + direction)
    setCurrentMonth(newMonth)
    
    // Загружаем доступность для нового месяца
    if (selectedBooking) {
      await loadMonthAvailability(newMonth)
    }
  }

  const loadMonthAvailability = async (month) => {
    if (!selectedBooking) return
    
    setAvailabilityLoading(true)
    const availability = { ...dateAvailability } // Сохраняем существующие данные
    
    try {
      const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
      const promises = []
      
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(month.getFullYear(), month.getMonth(), day)
        const dateStr = date.toISOString().split('T')[0]
        
        // Пропускаем прошедшие даты
        if (date < new Date()) continue
        
        const promise = apiFetch(`client/bookings/${selectedBooking.id}/available-slots?date=${dateStr}`, {
          headers: getAuthHeaders()
        })
        .then(response => {
          if (response.ok) {
            return response.json().then(data => ({
              date: dateStr,
              hasSlots: data.available_slots && data.available_slots.length > 0
            }))
          } else {
            return { date: dateStr, hasSlots: false }
          }
        }).catch(() => ({ date: dateStr, hasSlots: false }))
        
        promises.push(promise)
      }
      
      // Выполняем все запросы параллельно
      const results = await Promise.all(promises)
      
      // Формируем объект доступности
      results.forEach(result => {
        availability[result.date] = result.hasSlots
      })
      
      setDateAvailability(availability)
    } catch (error) {
      console.error('Ошибка при загрузке доступности дат для месяца:', error)
    } finally {
      setAvailabilityLoading(false)
    }
  }

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

  const handleDateChange = async (date) => {
    console.log('🔍 ОТЛАДКА: handleDateChange вызван для даты:', date)
    console.log('🔍 ОТЛАДКА: Текущий selectedDate:', selectedDate)
    
    setSelectedDate(date)
    setNewDateTime('')
    
    // Показываем загрузку для конкретной даты
    setLoadingDates(prev => new Set(prev).add(date))
    
    try {
      console.log('🔍 ОТЛАДКА: Вызываем loadAvailableSlots для даты:', date)
      await loadAvailableSlots(date)
    } finally {
      // Убираем индикатор загрузки
      setLoadingDates(prev => {
        const newSet = new Set(prev)
        newSet.delete(date)
        return newSet
      })
    }
  }

  const handleSlotSelect = (slot) => {
    const slotDate = new Date(slot.start_time)
    const year = slotDate.getFullYear()
    const month = String(slotDate.getMonth() + 1).padStart(2, '0')
    const day = String(slotDate.getDate()).padStart(2, '0')
    const hours = String(slotDate.getHours()).padStart(2, '0')
    const minutes = String(slotDate.getMinutes()).padStart(2, '0')
    
    setNewDateTime(`${year}-${month}-${day}T${hours}:${minutes}`)
  }

  const handleTimeEditConfirm = async () => {
    if (!selectedBooking || !newDateTime) return
    
    setTimeEditLoading(true)
    
    try {
      const response = await apiFetch(`client/bookings/${selectedBooking.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          start_time: newDateTime
        })
      })
      
      if (response.ok) {
        // Обновляем список бронирований
        const updatedBooking = { ...selectedBooking, start_time: newDateTime }
        setFutureBookings(futureBookings.map(b => 
          b.id === selectedBooking.id ? updatedBooking : b
        ))
        
        // Закрываем модальные окна
        setShowTimeEditModal(false)
        setShowEditBookingModal(false)
        setSelectedBooking(null)
        setNewDateTime('')
        setSelectedDate('')
        setAvailableSlots([])
        setDateAvailability({})
        setLoadingDates(new Set())
        setShowCalendar(false)
        setCurrentMonth(new Date())
        
        // Показываем уведомление об успехе
        alert('Время записи успешно изменено!')
      } else {
        const errorData = await response.json()
        alert(`Ошибка при изменении времени: ${errorData.detail || 'Неизвестная ошибка'}`)
      }
    } catch (error) {
      console.error('Ошибка при изменении времени:', error)
      alert('Ошибка при изменении времени записи')
    } finally {
      setTimeEditLoading(false)
    }
  }

  const handleRepeatBooking = (booking) => {
    setSelectedBooking(booking)
    setShowRepeatBookingModal(true)
  }

  const handleNote = (booking) => {
    setSelectedNoteBooking(booking)
    setShowClientNoteModal(true)
  }

  const handleCloseClientNoteModal = () => {
    setShowClientNoteModal(false)
    setSelectedNoteBooking(null)
  }

  const handleNoteSaved = (note) => {
    // Заметка была сохранена или удалена
    console.log('Заметка обновлена:', note)
  }

  return (
    <div className="py-8">
      <div className="max-w-7xl ml-0 mr-auto px-6 pt-8">
      {/* Приглашения стать управляющим филиала */}
      <ManagerInvitations />
      
      {/* Статистика дашборда */}
      <div className="mb-8">
        <ClientDashboardStats />
      </div>
      
      <div className="bg-gray-50 rounded-xl shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Избранные</h2>
        {favoritesLoading ? (
          <div>Загрузка...</div>
        ) : favorites.length === 0 ? (
          <div className="text-gray-500">Нет избранных</div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {favorites.map((favorite, index) => (
              <div key={index}>
                {renderFavoriteCard(favorite)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="bg-gray-50 rounded-xl shadow p-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Будущие записи</h2>
          {futureBookings.length > 3 && (
            <button
              onClick={() => {
                loadAllFutureBookings()
                setShowAllFutureBookingsModal(true)
              }}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Ещё
            </button>
          )}
        </div>
        {futureLoading ? (
          <div>Загрузка...</div>
        ) : futureBookings.length === 0 ? (
          <div className="text-gray-500">Нет записей</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2 px-3">Салон</th>
                <th className="py-2 px-3">Филиал</th>
                <th className="py-2 px-3">Мастер</th>
                <th className="py-2 px-3">Услуга</th>
                <th className="py-2 px-3">Стоимость</th>
                <th className="py-2 px-3">Длительность</th>
                <th className="py-2 px-3">Дата и время</th>
                <th className="py-2 px-3">Статус</th>
                <th className="py-2 px-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(futureBookings) ? futureBookings.slice(0, 3).map(b => (
                <tr key={b.id} className="border-b hover:bg-gray-100">
                  <td className="py-2 px-3">{b.salon_name}</td>
                  <td className="py-2 px-3">
                    {b.branch_name ? (
                      <div>
                        <div className="font-medium">{b.branch_name}</div>
                        {b.branch_address && (
                          <div className="text-xs text-gray-500">{b.branch_address}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">Основной</span>
                    )}
                  </td>
                  <td className="py-2 px-3">{b.master_name}</td>
                  <td className="py-2 px-3">
                    {b.service_name ? (
                      b.service_name.includes(' - ') ? 
                        b.service_name.split(' - ')[0] : 
                        b.service_name
                    ) : '-'}
                  </td>
                  <td className="py-2 px-3">{b.price} ₽</td>
                  <td className="py-2 px-3">{b.duration} мин</td>
                  <td className="py-2 px-3">
                    {b.start_time ? formatDate(b.start_time) : formatDate(b.date)}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getBookingStatusColor(b.status)}`}>
                      {getBookingStatusLabel(b.status)}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleEditBooking(b)}
                        className="text-blue-600 hover:text-blue-900" 
                        title="Редактировать"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteBooking(b)}
                        className="text-red-600 hover:text-red-900" 
                        title="Отменить"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="9" className="text-center py-4 text-gray-500">
                    Нет данных для отображения
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <div className="bg-gray-50 rounded-xl shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Прошедшие записи</h2>
          {bookings.length > 3 && (
            <button
              onClick={() => {
                loadAllPastBookings()
                setShowAllPastBookingsModal(true)
              }}
              className="text-blue-600 hover:text-blue-800 font-medium text-sm px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Ещё
            </button>
          )}
        </div>
        {loading ? (
          <div>Загрузка...</div>
        ) : bookings.length === 0 ? (
          <div className="text-gray-500">Нет записей</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b">
                <th className="py-2 px-3">Салон / Мастер</th>
                <th className="py-2 px-3">Услуга</th>
                <th className="py-2 px-3">Стоимость</th>
                <th className="py-2 px-3">Дата</th>
                <th className="py-2 px-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(bookings) ? bookings : []).slice(0, 3).map(b => (
                <tr key={b.id} className="border-b hover:bg-gray-100">
                  <td className="py-2 px-3">
                    {b.salon_name && b.salon_name !== '-' && b.master_name && b.master_name !== '-' ? (
                      <div>
                        <div>{b.salon_name}</div>
                        <div>{b.master_name}</div>
                      </div>
                    ) : b.salon_name && b.salon_name !== '-' ? (
                      b.salon_name
                    ) : b.master_name && b.master_name !== '-' ? (
                      b.master_name
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {b.service_name ? (
                      b.salon_name && b.salon_name !== '-' ? 
                        // Если есть салон, показываем только название услуги без мастера
                        b.service_name.split(' - ')[0]
                        : 
                        // Если нет салона (индивидуальный/гибридный мастер), показываем полное название услуги
                        b.service_name
                    ) : '-'}
                  </td>
                  <td className="py-2 px-3">{b.price} ₽</td>
                  <td className="py-2 px-3">{formatDate(b.date)}</td>
                  <td className="py-2 px-3">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleRepeatBooking(b)}
                        className="bg-[#4CAF50] text-white px-3 py-1 rounded text-sm hover:bg-[#45A049] transition-colors"
                        title="Повторить запись"
                      >
                        Повторить
                      </button>
                      <button
                        onClick={() => handleNote(b)}
                        className="bg-[#DFF5EC] text-gray-800 px-3 py-1 rounded text-sm hover:bg-[#C8E6D3] transition-colors"
                        title="Добавить заметку"
                      >
                        Заметка
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Модальное окно для установки пароля */}
      <PasswordSetupModal
        isOpen={showPasswordModal}
        onClose={handlePasswordClose}
        onSuccess={handlePasswordSuccess}
        mode={localStorage.getItem('existing_client_verification') === 'true' ? 'verification' : 'setup'}
      />

      {/* Модальное окно редактирования бронирования */}
      {showEditBookingModal && selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Редактирование записи</h2>
              <button 
                onClick={() => setShowEditBookingModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Услуга</label>
                <p className="text-sm text-gray-900">{selectedBooking.service_name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Мастер</label>
                <p className="text-sm text-gray-900">{selectedBooking.master_name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Дата и время</label>
                <p className="text-sm text-gray-900">
                  {selectedBooking.start_time ? formatDate(selectedBooking.start_time) : formatDate(selectedBooking.date)}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Статус</label>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getBookingStatusColor(selectedBooking.status)}`}>
                  {getBookingStatusLabel(selectedBooking.status)}
                </span>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowEditBookingModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Закрыть
              </button>
              <button
                onClick={handleTimeEdit}
                className="px-4 py-2 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049]"
              >
                Изменить время
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно изменения времени */}
      {showTimeEditModal && selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Изменение времени записи</h2>
              <button 
                onClick={() => {
                  setShowTimeEditModal(false)
                  setDateAvailability({})
                  setSelectedDate('')
                  setNewDateTime('')
                  setAvailableSlots([])
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Информация о записи */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Информация о записи</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-700">Услуга:</span>
                    <p className="text-gray-900">{selectedBooking.service_name}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Мастер:</span>
                    <p className="text-gray-900">{selectedBooking.master_name}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Текущее время:</span>
                    <p className="text-gray-900">
                      {selectedBooking.start_time ? formatDate(selectedBooking.start_time) : formatDate(selectedBooking.date)}
                    </p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Длительность:</span>
                    <p className="text-gray-900">{selectedBooking.duration} мин</p>
                  </div>
                </div>
              </div>

              {/* Выбор даты */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Выберите дату
                </label>
                
                <div className="relative calendar-container">
                  {/* Кнопка выбора даты */}
                  <button
                    onClick={() => setShowCalendar(!showCalendar)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-left flex justify-between items-center"
                  >
                    <span>
                      {selectedDate ? new Date(selectedDate).toLocaleDateString('ru-RU', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      }) : 'Выберите дату'}
                    </span>
                    <span className="text-gray-400">▼</span>
                  </button>
                  
                  {/* Выпадающий календарь */}
                  {showCalendar && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 p-3">
                      {/* Навигация по месяцам */}
                      <div className="flex justify-between items-center mb-3">
                        <button
                          onClick={() => changeMonth(-1)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          ←
                        </button>
                        <span className="font-medium text-gray-900">
                          {currentMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                        </span>
                        <button
                          onClick={() => changeMonth(1)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          →
                        </button>
                      </div>
                      
                      {availabilityLoading ? (
                        <div className="text-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#4CAF50] mx-auto"></div>
                          <p className="text-gray-600 mt-2 text-sm">Загрузка доступности дат...</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-7 gap-1">
                          {/* Заголовки дней недели - начинаем с понедельника */}
                          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                            <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                              {day}
                            </div>
                          ))}
                          
                          {/* Дни месяца */}
                          {(() => {
                            // JavaScript getDay(): 0=Воскресенье, 1=Понедельник, 2=Вторник, 3=Среда, 4=Четверг, 5=Пятница, 6=Суббота
                            // Вычисляем день недели ПЕРВОГО ДНЯ месяца (не текущей даты!)
                            const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
                            const firstDayOfWeek = firstDayOfMonth.getDay()
                            const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate()
                            
                            const days = []
                            
                            // Вычисляем отступ для начала календаря
                            // Если первый день месяца - воскресенье (0), то отступ = 6 (6 пустых ячеек)
                            // Если первый день месяца - понедельник (1), то отступ = 0 (0 пустых ячеек)
                            // Если первый день месяца - вторник (2), то отступ = 1 (1 пустая ячейка)
                            // И так далее...
                            const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1
                            for (let i = 0; i < offset; i++) {
                              days.push(<div key={`empty-${i}`} className="h-8"></div>)
                            }
                            
                            // Дни месяца
                            for (let day = 1; day <= daysInMonth; day++) {
                              const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
                              const dateStr = date.toISOString().split('T')[0]
                              const isToday = dateStr === new Date().toISOString().split('T')[0]
                              const isSelected = dateStr === selectedDate
                              const isPast = date < new Date()
                              
                              // Проверяем, является ли день выходным (суббота или воскресенье)
                              // JavaScript getDay(): 0=Воскресенье, 1=Понедельник, 2=Вторник, 3=Среда, 4=Четверг, 5=Пятница, 6=Суббота
                              // Наша схема: 1=Понедельник, 2=Вторник, 3=Среда, 4=Четверг, 5=Пятница, 6=Суббота, 7=Воскресенье
                              const dayOfWeek = date.getDay()
                              // Преобразуем в нашу схему: 0(Вс)->7, 1(Пн)->1, 2(Вт)->2, 3(Ср)->3, 4(Чт)->4, 5(Пт)->5, 6(Сб)->6
                              const normalizedDayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek
                              const isWeekend = normalizedDayOfWeek === 6 || normalizedDayOfWeek === 7 // 6 = суббота, 7 = воскресенье
                              
                              // Определяем статус доступности слота
                              const hasSlots = dateAvailability[dateStr]
                              const isLoading = loadingDates.has(dateStr)
                              
                              // День доступен для записи если:
                              // 1. Не прошедший
                              // 2. Не выходной
                              // 3. Есть доступные слоты (если уже проверено) или еще не проверен
                              const isAvailable = !isPast && !isWeekend && (hasSlots === true || hasSlots === undefined)
                              
                              // Отладочная информация для понедельника
                              if (normalizedDayOfWeek === 1) {
                                // Понедельник - всегда доступен для записи
                              }
                              
                              days.push(
                                <button
                                  key={day}
                                  onClick={() => isAvailable && !isLoading && handleDateChange(dateStr)}
                                  disabled={!isAvailable || isLoading}
                                  className={`h-8 rounded text-sm font-medium transition-colors relative ${
                                    isSelected
                                      ? 'bg-[#4CAF50] text-white'
                                      : isToday
                                      ? 'bg-[#4CAF50] text-white'
                                      : isPast
                                      ? 'text-gray-300 cursor-not-allowed'
                                      : isWeekend
                                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                      : isLoading
                                      ? 'bg-gray-100 text-gray-500 cursor-wait'
                                      : hasSlots === true
                                      ? 'bg-[#4CAF50] text-white hover:bg-[#45A049]'
                                      : hasSlots === false
                                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                      : 'bg-white text-gray-700 hover:bg-[#DFF5EC] border border-gray-200'
                                  }`}
                                >
                                  {isLoading ? (
                                    <div className="flex items-center justify-center">
                                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400"></div>
                                    </div>
                                  ) : (
                                    day
                                  )}
                                </button>
                              )
                            }
                            
                            return days
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Доступные слоты */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Доступные слоты на {selectedDate}</h3>
                
                {slotsLoading ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4CAF50] mx-auto"></div>
                    <p className="text-gray-600 mt-2">Загрузка доступных слотов...</p>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-gray-500">На выбранную дату нет доступных слотов</p>
                    <p className="text-sm text-gray-400 mt-1">Попробуйте выбрать другую дату</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-2 max-h-64 overflow-y-auto">
                    {availableSlots.map((slot, index) => (
                      <button
                        key={index}
                        onClick={() => handleSlotSelect(slot)}
                        className={`p-2 text-center rounded-lg border-2 transition-colors ${
                          newDateTime && newDateTime.includes(slot.formatted_time)
                            ? 'border-[#4CAF50] bg-[#DFF5EC] text-[#2E7D32]'
                            : 'border-gray-200 hover:border-[#4CAF50] hover:bg-[#DFF5EC]'
                        }`}
                      >
                        <div className="font-medium text-sm">{slot.formatted_time}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(slot.end_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Выбранное время */}
              {newDateTime && (
                <div className="bg-[#DFF5EC] border border-[#4CAF50] rounded-lg p-4">
                  <h4 className="font-medium text-[#2E7D32] mb-2">Выбранное время:</h4>
                  <p className="text-[#2E7D32]">
                    {new Date(newDateTime).toLocaleString('ru-RU', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowTimeEditModal(false)
                  setDateAvailability({})
                  setSelectedDate('')
                  setNewDateTime('')
                  setAvailableSlots([])
                  setLoadingDates(new Set())
                  setShowCalendar(false)
                  setCurrentMonth(new Date())
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                disabled={timeEditLoading}
              >
                Отмена
              </button>
              <button
                onClick={handleTimeEditConfirm}
                className="px-4 py-2 bg-[#4CAF50] text-white rounded-lg hover:bg-[#45A049] disabled:opacity-50"
                disabled={timeEditLoading || !newDateTime}
              >
                {timeEditLoading ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно подтверждения отмены бронирования */}
      {showDeleteBookingModal && selectedBooking && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-red-600">Отмена записи</h2>
              <button 
                onClick={() => setShowDeleteBookingModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-6">
              <p className="text-gray-700">
                Вы действительно хотите отменить запись на <strong>{selectedBooking.service_name}</strong>?
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Дата: {selectedBooking.start_time ? formatDate(selectedBooking.start_time) : formatDate(selectedBooking.date)}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Мастер: {selectedBooking.master_name}
              </p>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteBookingModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Отмена
              </button>
              <button
                onClick={handleDeleteBookingConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Отменить запись
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно повторной записи */}
      {showRepeatBookingModal && selectedRepeatBooking && (
        <RepeatBookingModal
          isOpen={showRepeatBookingModal}
          onClose={() => setShowRepeatBookingModal(false)}
          booking={selectedRepeatBooking}
          onBookingSuccess={loadDashboardData}
        />
      )}

      {/* Модальное окно всех будущих записей */}
      {showAllFutureBookingsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-6xl w-full mx-4 h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Все будущие записи</h2>
              <button 
                onClick={() => setShowAllFutureBookingsModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {allFutureLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-2">Загрузка записей...</p>
                </div>
              ) : allFutureBookings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Нет будущих записей</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b">
                      <th className="py-2 px-3">Салон</th>
                      <th className="py-2 px-3">Филиал</th>
                      <th className="py-2 px-3">Мастер</th>
                      <th className="py-2 px-3">Услуга</th>
                      <th className="py-2 px-3">Стоимость</th>
                      <th className="py-2 px-3">Длительность</th>
                      <th className="py-2 px-3">Дата и время</th>
                      <th className="py-2 px-3">Статус</th>
                      <th className="py-2 px-3">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allFutureBookings.map(b => (
                      <tr key={b.id} className="border-b hover:bg-gray-100">
                        <td className="py-2 px-3">{b.salon_name}</td>
                        <td className="py-2 px-3">
                          {b.branch_name ? (
                            <div>
                              <div className="font-medium">{b.branch_name}</div>
                              {b.branch_address && (
                                <div className="text-xs text-gray-500">{b.branch_address}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">Основной</span>
                          )}
                        </td>
                        <td className="py-2 px-3">{b.master_name}</td>
                        <td className="py-2 px-3">
                          {b.service_name ? (
                            b.service_name.includes(' - ') ? 
                              b.service_name.split(' - ')[0] : 
                              b.service_name
                          ) : '-'}
                        </td>
                        <td className="py-2 px-3">{b.price} ₽</td>
                        <td className="py-2 px-3">{b.duration} мин</td>
                        <td className="py-2 px-3">
                          {b.start_time ? formatDate(b.start_time) : formatDate(b.date)}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getBookingStatusColor(b.status)}`}>
                            {getBookingStatusLabel(b.status)}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex space-x-2">
                            <button 
                              onClick={() => handleEditBooking(b)}
                              className="text-blue-600 hover:text-blue-900" 
                              title="Редактировать"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteBooking(b)}
                              className="text-red-600 hover:text-red-900" 
                              title="Отменить"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно всех прошедших записей */}
      {showAllPastBookingsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-6xl w-full mx-4 h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Все прошедшие записи</h2>
              <button 
                onClick={() => setShowAllPastBookingsModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {allPastLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-2">Загрузка записей...</p>
                </div>
              ) : allPastBookings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>Нет прошедших записей</p>
                  <p className="text-sm text-gray-400 mt-2">
                    allPastBookings.length: {allPastBookings.length}
                  </p>
                  <p className="text-sm text-gray-400">
                    allPastLoading: {allPastLoading.toString()}
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b">
                      <th className="py-2 px-3">Салон / Мастер</th>
                      <th className="py-2 px-3">Услуга</th>
                      <th className="py-2 px-3">Стоимость</th>
                      <th className="py-2 px-3">Дата</th>
                      <th className="py-2 px-3">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPastBookings.map(b => (
                      <tr key={b.id} className="border-b hover:bg-gray-100">
                        <td className="py-2 px-3">
                          {b.salon_name && b.salon_name !== '-' && b.master_name && b.master_name !== '-' ? (
                            <div>
                              <div>{b.salon_name}</div>
                              <div>{b.master_name}</div>
                            </div>
                          ) : b.salon_name && b.salon_name !== '-' ? (
                            b.salon_name
                          ) : b.master_name && b.master_name !== '-' ? (
                            b.master_name
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {b.service_name ? (
                            b.salon_name && b.salon_name !== '-' ? 
                              // Если есть салон, показываем только название услуги без мастера
                              b.service_name.split(' - ')[0]
                              : 
                              // Если нет салона (индивидуальный/гибридный мастер), показываем полное название услуги
                              b.service_name
                          ) : '-'}
                        </td>
                        <td className="py-2 px-3">{b.price} ₽</td>
                        <td className="py-2 px-3">{formatDate(b.date)}</td>
                        <td className="py-2 px-3">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleRepeatBooking(b)}
                              className="bg-[#4CAF50] text-white px-3 py-1 rounded text-sm hover:bg-[#45A049] transition-colors"
                              title="Повторить запись"
                            >
                              Повторить
                            </button>
                            <button
                              onClick={() => handleNote(b)}
                              className="bg-[#DFF5EC] text-gray-800 px-3 py-1 rounded text-sm hover:bg-[#C8E6D3] transition-colors"
                              title="Добавить заметку"
                            >
                              Заметка
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно заметок */}
      {showClientNoteModal && selectedNoteBooking && (
        <ClientNoteModal
          isOpen={showClientNoteModal}
          onClose={handleCloseClientNoteModal}
          booking={selectedNoteBooking}
          onNoteSaved={handleNoteSaved}
        />
      )}
      </div>
    </div>
  )
} 