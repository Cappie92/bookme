import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiGet, apiFetch } from '../utils/api'
import { PencilIcon, TrashIcon, ArrowPathIcon, PencilSquareIcon, HandThumbDownIcon, CalendarIcon, ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline"
import PasswordSetupModal from "../modals/PasswordSetupModal"
import ManagerInvitations from "../components/ManagerInvitations"
import ClientDashboardStats from "../components/ClientDashboardStats"
import RepeatBookingModal from "../modals/RepeatBookingModal"
import ClientNoteModal from '../modals/ClientNoteModal'
import FavoriteButton from '../components/FavoriteButton'
import { useFavorites } from '../contexts/FavoritesContext'
import { useToast } from '../contexts/ToastContext'
import Tooltip from '../components/Tooltip'
import ClientLoyaltyPoints from '../components/ClientLoyaltyPoints'
import { clientBookingCalendarPathSegment } from '../utils/bookingCalendarApi'

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

// Компактный формат даты: ДД.ММ.ГГ
function formatDateShort(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  
  return `${day}.${month}.${year}`
}

// Компактный формат даты и времени: ДД.ММ.ГГ, ЧЧ:ММ
function formatDateTimeShort(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = String(d.getFullYear()).slice(-2)
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  
  return `${day}.${month}.${year}, ${hours}:${minutes}`
}

function formatTimeOnly(dateStr) {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '-'
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** Крестик закрытия модалок: SVG, без Unicode ✕ (iOS). */
function DashboardModalClose({ onClick, ariaLabel = 'Закрыть' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
      aria-label={ariaLabel}
    >
      <XMarkIcon className="w-6 h-6" strokeWidth={2} />
    </button>
  )
}

function getBookingStatusLabel(status) {
  const statusLabels = {
    'created': 'Создана',
    'pending': 'На подтверждении',
    'awaiting_confirmation': 'На подтверждении',
    'confirmed': 'Подтверждено',
    'completed': 'Завершено',
    'cancelled': 'Отменено',
    'cancelled_by_client_early': 'Отменено клиентом',
    'cancelled_by_client_late': 'Отменено клиентом',
    'awaiting_payment': 'Ожидает оплаты',
    'payment_expired': 'Оплата истекла'
  }
  return statusLabels[status] || status
}

function getBookingStatusColor(status) {
  const statusColors = {
    'pending': 'bg-yellow-100 text-yellow-800',
    'confirmed': 'bg-green-100 text-green-800',
    'cancelled': 'bg-red-100 text-red-800',
    'completed': 'bg-green-100 text-green-800'
  }
  return statusColors[status] || 'bg-gray-100 text-gray-800'
}

export default function ClientDashboard() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [futureBookings, setFutureBookings] = useState([])
  const [futureLoading, setFutureLoading] = useState(true)
  const [favorites, setFavorites] = useState([])
  const [favoritesLoading, setFavoritesLoading] = useState(true)
  const [favoriteMasterIds, setFavoriteMasterIds] = useState(new Set())
  const { changeCounter } = useFavorites()
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
  const [futureBookingsError, setFutureBookingsError] = useState(null)
  const [pastBookingsError, setPastBookingsError] = useState(null)
  const [allFutureError, setAllFutureError] = useState(null)
  const [allPastError, setAllPastError] = useState(null)
  const [showClientNoteModal, setShowClientNoteModal] = useState(false)
  const [selectedNoteBooking, setSelectedNoteBooking] = useState(null)
  const [salonsEnabled, setSalonsEnabled] = useState(false)
  const [showLoyaltyHistoryModal, setShowLoyaltyHistoryModal] = useState(false)
  const [loyaltyPoints, setLoyaltyPoints] = useState([])
  const [selectedLoyaltyMaster, setSelectedLoyaltyMaster] = useState(null)
  const [calendarDropdownId, setCalendarDropdownId] = useState(null)
  const [showCalendarEmailModal, setShowCalendarEmailModal] = useState(false)
  const [calendarEmailBooking, setCalendarEmailBooking] = useState(null)
  const [calendarEmail, setCalendarEmail] = useState('')
  const [calendarAlarmMinutes, setCalendarAlarmMinutes] = useState(60)
  const [calendarEmailSending, setCalendarEmailSending] = useState(false)
  const { showToast } = useToast()

  // Helper: единый ключ мастера для синхронизации favorites
  const getMasterKey = (row) => {
    const id = row.master_id ?? row.indie_master_id ?? row.masterId ?? row.master?.id ?? row.master?.master_id ?? row.master_user_id ?? row.master?.user_id ?? row.masterUserId
    const numId = Number(id)
    if (isNaN(numId)) {
      console.warn('[getMasterKey] Invalid master ID:', row)
      return null
    }
    return numId
  }

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
      setFavoritesLoading(true)
      
      // Загружаем stats для получения флага salonsEnabled
      let salonsEnabledFlag = false
      try {
        const statsData = await apiGet('/api/client/dashboard/stats')
        salonsEnabledFlag = statsData?.salons_enabled === true
        setSalonsEnabled(salonsEnabledFlag)
      } catch (error) {
        console.error('Ошибка при загрузке stats:', error)
      }
      
      // Загружаем будущие записи (краткий список, до 5 — по умолчанию на бэкенде)
      setFutureBookingsError(null)
      try {
      const futureData = await apiGet('/api/client/bookings/')
      setFutureBookings(Array.isArray(futureData) ? futureData : (futureData?.bookings || []))
      } catch (error) {
        console.error('Ошибка при загрузке будущих записей:', error)
        setFutureBookings([])
        const d = error?.response?.data?.detail
        setFutureBookingsError(
          typeof d === 'string' ? d : 'Не удалось загрузить будущие записи. Попробуйте обновить страницу.'
        )
      } finally {
      setFutureLoading(false)
      }
      
      // Загружаем прошедшие записи (краткий список)
      setPastBookingsError(null)
      try {
      const pastData = await apiGet('/api/client/bookings/past')
      setBookings(Array.isArray(pastData) ? pastData : (pastData?.bookings || []))
      } catch (error) {
        console.error('Ошибка при загрузке прошедших записей:', error)
        setBookings([])
        const d = error?.response?.data?.detail
        setPastBookingsError(
          typeof d === 'string' ? d : 'Не удалось загрузить прошедшие записи. Попробуйте обновить страницу.'
        )
      } finally {
      setLoading(false)
      }
      
      // Загружаем избранные
      const allFavorites = []
      
      // Загружаем избранные салоны (только если salonsEnabled)
      if (salonsEnabledFlag) {
        try {
          const salonsResponse = await fetch('/api/client/favorites/salons', {
            headers: getAuthHeaders()
          })
          if (salonsResponse.ok) {
            const salonsData = await salonsResponse.json()
            allFavorites.push(...salonsData.map(fav => ({ ...fav, type: 'salon' })))
          }
        } catch (error) {
          console.error('Ошибка при загрузке избранных салонов:', error)
        }
      }
      
      // Загружаем избранных мастеров
      try {
        const mastersResponse = await fetch('/api/client/favorites/masters', {
          headers: getAuthHeaders()
        })
        if (mastersResponse.ok) {
          const mastersData = await mastersResponse.json()
          allFavorites.push(...mastersData.map(fav => ({ ...fav, type: 'master' })))
        }
      } catch (error) {
        console.error('Ошибка при загрузке избранных мастеров:', error)
      }
      
      // Загружаем избранные услуги
      try {
        const servicesResponse = await fetch('/api/client/favorites/services', {
          headers: getAuthHeaders()
        })
        if (servicesResponse.ok) {
          const servicesData = await servicesResponse.json()
          allFavorites.push(...servicesData.map(fav => ({ ...fav, type: 'service' })))
        }
      } catch (error) {
        console.error('Ошибка при загрузке избранных услуг:', error)
      }
      
      setFavorites(allFavorites)
      
      // Построить Set избранных мастеров для быстрой проверки
      const masterIds = new Set()
      allFavorites.forEach(fav => {
        if (fav.type === 'master' && fav.master_id) {
          masterIds.add(Number(fav.master_id))
        } else if (fav.type === 'indie_master' && fav.indie_master_id) {
          masterIds.add(Number(fav.indie_master_id))
        }
      })
      setFavoriteMasterIds(masterIds)
      
      setFavoritesLoading(false)
    } catch (error) {
      console.error('Ошибка при загрузке данных:', error)
    } finally {
      // В любом случае снимаем индикаторы загрузки, чтобы отобразить содержимое
      setFutureLoading(false)
      setLoading(false)
      setFavoritesLoading(false)
    }
  }

  // Обработчик изменения избранного через FavoriteButton
  const handleFavoriteChange = (type, itemId, isFavorite) => {
    // Обновляем Set избранных мастеров для синхронизации между секциями
    if (type === 'master' || type === 'indie_master') {
      // Приводим к числу для консистентности
      const normalizedId = Number(itemId)
      setFavoriteMasterIds(prev => {
        const newSet = new Set(prev)
        if (isFavorite) {
          newSet.add(normalizedId)
        } else {
          newSet.delete(normalizedId)
        }
        return newSet
      })
    }
    
    if (!isFavorite) {
      // Удаление: фильтруем массив favorites
      setFavorites(prev => prev.filter(favorite => {
        if (type === 'indie_master') {
          return favorite.type !== 'indie_master' || favorite.indie_master_id !== itemId
        } else if (type === 'master') {
          return favorite.type !== 'master' || favorite.master_id !== itemId
        } else if (type === 'salon') {
          return favorite.type !== 'salon' || favorite.salon_id !== itemId
        } else if (type === 'service') {
          return favorite.type !== 'service' || favorite.service_id !== itemId
        }
        return true
      }))
    } else {
      // Добавление: перезагружаем список избранных для получения полных данных
      // Перезагружаем только избранные, не трогая записи
      const reloadFavorites = async () => {
        try {
          setFavoritesLoading(true)
          const allFavorites = []
          
          // Загружаем избранные салоны
          try {
            const salonsResponse = await fetch('/api/client/favorites/salons', {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
              }
            })
            if (salonsResponse.ok) {
              const salonsData = await salonsResponse.json()
              allFavorites.push(...salonsData.map(fav => ({ ...fav, type: 'salon' })))
            }
          } catch (error) {
            console.error('Ошибка при загрузке избранных салонов:', error)
          }
          
          // Загружаем избранных мастеров
          try {
            const mastersResponse = await fetch('/api/client/favorites/masters', {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
              }
            })
            if (mastersResponse.ok) {
              const mastersData = await mastersResponse.json()
              allFavorites.push(...mastersData.map(fav => ({ ...fav, type: 'master' })))
            }
          } catch (error) {
            console.error('Ошибка при загрузке избранных мастеров:', error)
          }
          
          // Загружаем избранные услуги
          try {
            const servicesResponse = await fetch('/api/client/favorites/services', {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('access_token')}`
              }
            })
            if (servicesResponse.ok) {
              const servicesData = await servicesResponse.json()
              allFavorites.push(...servicesData.map(fav => ({ ...fav, type: 'service' })))
            }
          } catch (error) {
            console.error('Ошибка при загрузке избранных услуг:', error)
          }
          
          setFavorites(allFavorites)
          
          // Обновить Set избранных мастеров
          const masterIds = new Set()
          allFavorites.forEach(fav => {
            if (fav.type === 'master' && fav.master_id) {
              masterIds.add(fav.master_id)
            } else if (fav.type === 'indie_master' && fav.indie_master_id) {
              masterIds.add(fav.indie_master_id)
            }
          })
          setFavoriteMasterIds(masterIds)
        } catch (error) {
          console.error('Ошибка при перезагрузке избранных:', error)
        } finally {
          setFavoritesLoading(false)
        }
      }
      
      reloadFavorites()
    }
  }

  // Функция для отображения карточки избранного
  const renderFavoriteCard = (favorite) => {
    let title = 'Избранное'
    let name = favorite.favorite_name || 'Название не указано'
    let masterDomain = null
    
    if (favorite.type === 'salon' && favorite.salon) {
      title = 'Салон'
      name = favorite.salon.name || favorite.favorite_name || 'Салон'
    } else if (favorite.type === 'master' && favorite.master) {
      title = 'Мастер'
      name = favorite.master.user?.full_name || favorite.favorite_name || 'Мастер'
      masterDomain = favorite.master.domain || null
    } else if (favorite.type === 'indie_master') {
      title = 'Индивидуальный мастер'
      // Используем данные из indie_master если есть, иначе favorite_name
      if (favorite.indie_master && favorite.indie_master.user) {
        name = favorite.indie_master.user.full_name || favorite.favorite_name || 'Индивидуальный мастер'
        masterDomain = favorite.indie_master.domain || null
      } else {
        name = favorite.favorite_name || 'Индивидуальный мастер'
      }
    } else if (favorite.type === 'service' && favorite.service) {
      title = 'Услуга'
      name = favorite.service.name || favorite.favorite_name || 'Услуга'
    } else {
      title = favorite.type === 'salon' ? 'Салон' : 
              favorite.type === 'master' ? 'Мастер' : 
              favorite.type === 'indie_master' ? 'Индивидуальный мастер' :
              favorite.type === 'service' ? 'Услуга' : 'Избранное'
    }
    
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-500 mb-1">{title}</div>
            {masterDomain ? (
              <Link 
                to={`/domain/${masterDomain}`}
                className="text-green-600 hover:text-green-800 hover:underline font-medium text-sm block truncate"
              >
                {name}
              </Link>
            ) : (
              <div className="font-medium text-sm text-gray-900 truncate">{name}</div>
            )}
          </div>
          <div className="flex-shrink-0">
            {(favorite.type === 'master' && favorite.master_id) && (
              <FavoriteButton
                type="master"
                itemId={favorite.master_id}
                itemName={name}
                size="sm"
                onFavoriteChange={handleFavoriteChange}
              />
            )}
            {(favorite.type === 'indie_master' && favorite.indie_master_id) && (
              <FavoriteButton
                type="indie_master"
                itemId={favorite.indie_master_id}
                itemName={name}
                size="sm"
                onFavoriteChange={handleFavoriteChange}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  // Функция для загрузки всех будущих записей
  const loadAllFutureBookings = async () => {
    try {
      setAllFutureLoading(true)
      setAllFutureError(null)
      const data = await apiGet('/api/client/bookings/?full=true')
      const list = Array.isArray(data) ? data : (data?.bookings || [])
      setAllFutureBookings(list)
    } catch (error) {
      console.error('Ошибка при загрузке всех будущих записей:', error)
      setAllFutureBookings([])
      const d = error?.response?.data?.detail
      setAllFutureError(
        typeof d === 'string' ? d : 'Не удалось загрузить полный список записей.'
      )
    } finally {
      setAllFutureLoading(false)
    }
  }

  // Функция для загрузки всех прошедших записей
  const loadAllPastBookings = async () => {
    try {
      setAllPastLoading(true)
      setAllPastError(null)
      const data = await apiGet('/api/client/bookings/past?full=true')
      const list = Array.isArray(data) ? data : (data?.bookings || [])
      setAllPastBookings(list)
    } catch (error) {
      console.error('Ошибка при загрузке всех прошедших записей:', error)
      setAllPastBookings([])
      const d = error?.response?.data?.detail
      setAllPastError(
        typeof d === 'string' ? d : 'Не удалось загрузить полный список записей.'
      )
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

  // Автоматически перезагружаем список избранных при изменении контекста
  useEffect(() => {
    // Перезагружаем только блок избранных, не трогая записи
    const reloadFavorites = async () => {
      try {
        setFavoritesLoading(true)
        const allFavorites = []
        
        // Загружаем избранные салоны
        try {
          const salonsResponse = await fetch('/api/client/favorites/salons', {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
          })
          if (salonsResponse.ok) {
            const salonsData = await salonsResponse.json()
            allFavorites.push(...salonsData.map(fav => ({ ...fav, type: 'salon' })))
          }
        } catch (error) {
          console.error('Ошибка при загрузке избранных салонов:', error)
        }
        
        // Загружаем избранных мастеров
        try {
          const mastersResponse = await fetch('/api/client/favorites/masters', {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
          })
          if (mastersResponse.ok) {
            const mastersData = await mastersResponse.json()
            allFavorites.push(...mastersData.map(fav => ({ ...fav, type: 'master' })))
          }
        } catch (error) {
          console.error('Ошибка при загрузке избранных мастеров:', error)
        }
        
        // Загружаем избранные услуги
        try {
          const servicesResponse = await fetch('/api/client/favorites/services', {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('access_token')}`
            }
          })
          if (servicesResponse.ok) {
            const servicesData = await servicesResponse.json()
            allFavorites.push(...servicesData.map(fav => ({ ...fav, type: 'service' })))
          }
        } catch (error) {
          console.error('Ошибка при загрузке избранных услуг:', error)
        }
        
        setFavorites(allFavorites)
        
        // Обновить Set избранных мастеров
        const masterIds = new Set()
        allFavorites.forEach(fav => {
          if (fav.type === 'master' && fav.master_id) {
            masterIds.add(fav.master_id)
          } else if (fav.type === 'indie_master' && fav.indie_master_id) {
            masterIds.add(fav.indie_master_id)
          }
        })
        setFavoriteMasterIds(masterIds)
      } catch (error) {
        console.error('Ошибка при перезагрузке избранных:', error)
      } finally {
        setFavoritesLoading(false)
      }
    }

    // Используем небольшую задержку, чтобы избежать лишних запросов
    const timeoutId = setTimeout(reloadFavorites, 500)
    return () => clearTimeout(timeoutId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeCounter])

  const handleCalendarGoogle = async (booking) => {
    setCalendarDropdownId(null)
    const seg = clientBookingCalendarPathSegment(booking)
    if (!seg) {
      showToast('Нет данных записи для календаря', 'error')
      return
    }
    try {
      const res = await apiGet(`/api/client/bookings/${seg}/calendar/google-link`)
      if (res?.url) window.open(res.url, '_blank')
      else showToast('Ошибка получения ссылки', 'error')
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Ошибка', 'error')
    }
  }

  const handleCalendarDownloadIcs = async (booking, alarmMinutes = 60) => {
    setCalendarDropdownId(null)
    const seg = clientBookingCalendarPathSegment(booking)
    if (!seg) {
      showToast('Нет данных записи для календаря', 'error')
      return
    }
    try {
      const url = `/api/client/bookings/${seg}/calendar.ics?alarm_minutes=${alarmMinutes}`
      const token = localStorage.getItem('access_token')
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.detail || 'Ошибка')
      }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      const pr = booking?.public_reference != null ? String(booking.public_reference).trim() : ''
      a.download = pr ? `booking-${pr}.ics` : `booking-${booking.id}.ics`
      a.click()
      URL.revokeObjectURL(a.href)
      showToast('Файл скачан', 'success')
    } catch (e) {
      showToast(e?.message || e?.response?.data?.detail || 'Ошибка', 'error')
    }
  }

  const openCalendarEmailModal = async (b) => {
    setCalendarEmailBooking(b)
    setCalendarAlarmMinutes(60)
    try {
      const me = await apiGet('/api/auth/users/me')
      setCalendarEmail(me?.email || '')
    } catch {
      setCalendarEmail('')
    }
    setShowCalendarEmailModal(true)
    setCalendarDropdownId(null)
  }

  const handleCalendarSendEmail = async () => {
    if (!calendarEmailBooking) return
    const email = (calendarEmail || '').trim()
    if (!email) {
      showToast('Введите email', 'error')
      return
    }
    setCalendarEmailSending(true)
    try {
      const seg = clientBookingCalendarPathSegment(calendarEmailBooking)
      if (!seg) {
        showToast('Нет данных записи для календаря', 'error')
        return
      }
      await apiPost(`/api/client/bookings/${seg}/calendar/email`, {
        email,
        alarm_minutes: calendarAlarmMinutes,
      })
      showToast('Отправлено', 'success')
      setShowCalendarEmailModal(false)
      setCalendarEmailBooking(null)
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Ошибка', 'error')
    } finally {
      setCalendarEmailSending(false)
    }
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
      const response = await apiFetch(`/api/client/bookings/${selectedBooking.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      
      if (response.ok) {
        const cancelledId = selectedBooking.id
        setFutureBookings((prev) => prev.filter((b) => b.id !== cancelledId))
        setAllFutureBookings((prev) => prev.filter((b) => b.id !== cancelledId))
        setShowDeleteBookingModal(false)
        setSelectedBooking(null)
        showToast('Запись отменена', 'success')
        loadDashboardData()
      } else {
        console.error('Ошибка при отмене бронирования')
        showToast('Не удалось отменить запись', 'error')
      }
    } catch (error) {
      console.error('Ошибка при отмене бронирования:', error)
      showToast('Не удалось отменить запись', 'error')
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
      const url = `/api/client/bookings/${selectedBooking.id}/available-slots?date=${date}`
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
        
        const promise = apiFetch(`/api/client/bookings/${selectedBooking.id}/available-slots?date=${dateStr}`, {
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
        
        const promise = apiFetch(`/api/client/bookings/${selectedBooking.id}/available-slots?date=${dateStr}`, {
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
      const response = await apiFetch(`/api/client/bookings/${selectedBooking.id}`, {
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

  const handleShowLoyaltyHistory = async () => {
    try {
      const data = await apiGet('/api/client/loyalty/points')
      const masters = data?.masters || []
      setLoyaltyPoints(masters)
      
      if (masters.length === 1) {
        // Если один мастер - открываем сразу его историю
        setSelectedLoyaltyMaster(masters[0])
      } else {
        // Если несколько - открываем список мастеров
        setSelectedLoyaltyMaster(null)
      }
      
      setShowLoyaltyHistoryModal(true)
    } catch (error) {
      console.error('Ошибка при загрузке истории баллов:', error)
    }
  }

  const formatDateForLoyalty = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="py-4 lg:py-8" data-testid="client-dashboard">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
      {/* Приглашения стать управляющим филиала */}
      <ManagerInvitations />
      
      {/* Секции с единым spacing */}
      <div className="space-y-4 lg:space-y-6">
        {/* Будущие записи */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 lg:p-6" data-testid="client-future-bookings-section">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-3 lg:mb-4">
          <h2 className="text-lg lg:text-xl font-semibold" data-testid="client-bookings-title">Будущие записи</h2>
          {futureBookings.length > 3 && (
            <button
              type="button"
              onClick={() => {
                loadAllFutureBookings()
                setShowAllFutureBookingsModal(true)
              }}
              className="text-green-600 hover:text-green-800 font-medium text-sm px-3 py-2 rounded-lg hover:bg-green-50 transition-colors border border-green-200 w-full sm:w-auto text-center min-h-[40px]"
            >
              Посмотреть все
            </button>
          )}
        </div>
        {futureLoading ? (
          <div>Загрузка...</div>
        ) : futureBookingsError ? (
          <div className="text-red-600 text-sm" role="alert" data-testid="client-bookings-error">
            {futureBookingsError}
          </div>
        ) : futureBookings.length === 0 ? (
          <div className="text-gray-500" data-testid="client-bookings-empty">Нет записей</div>
        ) : (
          <div data-testid="client-bookings-list">
            <div className="lg:hidden space-y-2">
              {(Array.isArray(futureBookings) ? futureBookings : []).slice(0, 3).map((b, idx) => {
                const masterKey = getMasterKey(b)
                const isFav = masterKey !== null && favoriteMasterIds.has(masterKey)
                return (
                  <div
                    key={b.id}
                    className="rounded-lg border border-gray-100 bg-white p-2.5 shadow-sm"
                    data-testid={`client-booking-item-${idx}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[13px] font-semibold text-gray-900 leading-tight tabular-nums">
                        {b.start_time ? formatDateTimeShort(b.start_time) : formatDateTimeShort(b.date)}
                      </div>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-tight shrink-0 max-w-[52%] text-right ${getBookingStatusColor(b.status)}`}>
                        {getBookingStatusLabel(b.status)}
                      </span>
                    </div>
                    {salonsEnabled && b.salon_name && (
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">{b.salon_name}</p>
                    )}
                    {salonsEnabled && (b.branch_name || b.branch_address) && (
                      <p className="text-[11px] text-gray-500 leading-snug line-clamp-1">
                        {b.branch_name || 'Основной'}
                        {b.branch_address ? ` · ${b.branch_address}` : ''}
                      </p>
                    )}
                    <div className="text-[13px] text-gray-900 leading-snug mt-1">
                      {b.master_domain ? (
                        <Link
                          to={`/domain/${b.master_domain}`}
                          className="text-[#2e7d32] font-medium hover:underline"
                        >
                          {b.master_name}
                        </Link>
                      ) : (
                        <span className="font-medium">{b.master_name}</span>
                      )}
                    </div>
                    <p className="text-[12px] text-gray-600 leading-snug line-clamp-2 mt-0.5">
                      {b.service_name
                        ? b.service_name.includes(' - ')
                          ? b.service_name.split(' - ')[0]
                          : b.service_name
                        : '—'}
                      <span className="text-gray-400"> · </span>
                      <span className="tabular-nums">{b.price} ₽</span>
                      <span className="text-gray-400"> · </span>
                      <span>{b.duration} мин</span>
                    </p>
                    <div className="flex flex-wrap items-center justify-end gap-0.5 mt-2 pt-1.5 border-t border-gray-100">
                      <div className="inline-flex items-center justify-center w-10 h-10 min-w-[40px] min-h-[40px]">
                        {b.master_name && b.master_name !== '-' && (
                          <>
                            {b.indie_master_id ? (
                              <FavoriteButton
                                type="indie_master"
                                itemId={b.indie_master_id}
                                itemName={b.master_name}
                                size="sm"
                                isFavorite={isFav}
                                onFavoriteChange={handleFavoriteChange}
                              />
                            ) : b.master_id ? (
                              <FavoriteButton
                                type="master"
                                itemId={b.master_id}
                                itemName={b.master_name}
                                size="sm"
                                isFavorite={isFav}
                                onFavoriteChange={handleFavoriteChange}
                              />
                            ) : null}
                          </>
                        )}
                      </div>
                      {b.master_timezone?.trim?.() && (
                        <div className="inline-flex items-center justify-center w-10 h-10 min-w-[40px] min-h-[40px] relative">
                          <button
                            type="button"
                            onClick={() => setCalendarDropdownId(calendarDropdownId === b.id ? null : b.id)}
                            className="text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                            title="Добавить в календарь"
                          >
                            <CalendarIcon className="w-4 h-4" />
                          </button>
                          {calendarDropdownId === b.id && (
                            <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => handleCalendarGoogle(b)}
                              >
                                <CalendarIcon className="w-4 h-4" /> Google Calendar
                              </button>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => handleCalendarDownloadIcs(b)}
                              >
                                <CalendarIcon className="w-4 h-4" /> Скачать .ics
                              </button>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => openCalendarEmailModal(b)}
                              >
                                <CalendarIcon className="w-4 h-4" /> Отправить на email
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEditBooking(b)}
                        className="text-green-600 hover:text-green-900 hover:bg-green-50 rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                        title="Редактировать"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBooking(b)}
                        className="text-red-600 hover:text-red-900 hover:bg-red-50 rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                        title="Отменить"
                        data-testid="client-booking-cancel-btn"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b">
                {salonsEnabled && <th className="py-2 px-3">Салон</th>}
                {salonsEnabled && <th className="py-2 px-3">Филиал</th>}
                <th className="py-2 px-3">Мастер</th>
                <th className="py-2 px-3">Услуга</th>
                <th className="py-2 px-3">Стоимость</th>
                <th className="py-2 px-3">Длительность</th>
                <th className="py-2 px-3">Дата и время</th>
                <th className="py-2 px-3">Статус</th>
                <th className="py-2 px-3 w-[96px] text-center align-middle">Действия</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(futureBookings) ? futureBookings.slice(0, 3).map((b, idx) => (
                <tr key={b.id} className="border-b hover:bg-gray-100" data-testid={`client-booking-item-${idx}`}>
                  {salonsEnabled && <td className="py-2 px-3">{b.salon_name}</td>}
                  {salonsEnabled && (
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
                  )}
                  <td className="py-2 px-3">
                    {b.master_domain ? (
                      <Link 
                        to={`/domain/${b.master_domain}`}
                        className="text-green-600 hover:text-green-800 hover:underline"
                      >
                        {b.master_name}
                      </Link>
                    ) : (
                      <span>{b.master_name}</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {b.service_name ? (
                      b.service_name.includes(' - ') ? 
                        b.service_name.split(' - ')[0] : 
                        b.service_name
                    ) : '-'}
                  </td>
                  <td className="py-2 px-3">{b.price} ₽</td>
                  <td className="py-2 px-3">{b.duration} мин</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {b.start_time ? formatDateTimeShort(b.start_time) : formatDateTimeShort(b.date)}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getBookingStatusColor(b.status)}`}>
                      {getBookingStatusLabel(b.status)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="flex items-center justify-end gap-[2px]">
                      <div className="inline-flex items-center justify-center w-8 h-8">
                        {b.master_name && b.master_name !== '-' && (() => {
                          const masterKey = getMasterKey(b)
                          const isFav = masterKey !== null && favoriteMasterIds.has(masterKey)
                          return (
                            <>
                              {b.indie_master_id ? (
                                <FavoriteButton
                                  type="indie_master"
                                  itemId={b.indie_master_id}
                                  itemName={b.master_name}
                                  size="sm"
                                  isFavorite={isFav}
                                  onFavoriteChange={handleFavoriteChange}
                                />
                              ) : b.master_id ? (
                                <FavoriteButton
                                  type="master"
                                  itemId={b.master_id}
                                  itemName={b.master_name}
                                  size="sm"
                                  isFavorite={isFav}
                                  onFavoriteChange={handleFavoriteChange}
                                />
                              ) : null}
                            </>
                          )
                        })()}
                      </div>
                      {b.master_timezone?.trim?.() && (
                        <div className="inline-flex items-center justify-center w-8 h-8 relative">
                          <button
                            onClick={() => setCalendarDropdownId(calendarDropdownId === b.id ? null : b.id)}
                            className="text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-md p-1"
                            title="Добавить в календарь"
                          >
                            <CalendarIcon className="w-4 h-4" />
                          </button>
                          {calendarDropdownId === b.id && (
                            <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => handleCalendarGoogle(b)}
                              >
                                <CalendarIcon className="w-4 h-4" /> Google Calendar
                              </button>
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => handleCalendarDownloadIcs(b)}
                              >
                                <CalendarIcon className="w-4 h-4" /> Скачать .ics
                              </button>
                              <button
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                onClick={() => openCalendarEmailModal(b)}
                              >
                                <CalendarIcon className="w-4 h-4" /> Отправить на email
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="inline-flex items-center justify-center w-8 h-8">
                        <button 
                          onClick={() => handleEditBooking(b)}
                          className="text-green-600 hover:text-green-900 hover:bg-green-50 rounded-md p-1" 
                          title="Редактировать"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="inline-flex items-center justify-center w-8 h-8">
                        <button 
                          onClick={() => handleDeleteBooking(b)}
                          className="text-red-600 hover:text-red-900 hover:bg-red-50 rounded-md p-1" 
                          title="Отменить"
                          data-testid="client-booking-cancel-btn"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
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
            </div>
          </div>
        )}
        </div>
        
        {/* Прошедшие записи */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 lg:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-3 lg:mb-4">
            <h2 className="text-lg lg:text-xl font-semibold">Прошедшие записи</h2>
          {bookings.length > 3 && (
            <button
              type="button"
              onClick={() => {
                loadAllPastBookings()
                setShowAllPastBookingsModal(true)
              }}
              className="text-green-600 hover:text-green-800 font-medium text-sm px-3 py-2 rounded-lg hover:bg-green-50 transition-colors border border-green-200 w-full sm:w-auto text-center min-h-[40px]"
            >
              Посмотреть все
            </button>
          )}
        </div>
        {loading ? (
          <div>Загрузка...</div>
        ) : pastBookingsError ? (
          <div className="text-red-600 text-sm" role="alert">
            {pastBookingsError}
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-gray-500">Нет записей</div>
        ) : (
          <>
            <div className="lg:hidden space-y-2" data-testid="client-past-bookings-list-mobile">
              {(Array.isArray(bookings) ? bookings : []).slice(0, 3).map((b) => {
                const masterKey = getMasterKey(b)
                const isFav = masterKey !== null && favoriteMasterIds.has(masterKey)
                const serviceDisplay = b.service_name
                  ? b.salon_name && b.salon_name !== '-'
                    ? b.service_name.split(' - ')[0]
                    : b.service_name
                  : '—'
                const masterSalonBlock =
                  salonsEnabled && b.salon_name && b.salon_name !== '-' && b.master_name && b.master_name !== '-' ? (
                    <div className="text-[12px] leading-snug mt-0.5">
                      <div className="text-gray-500 text-[11px] truncate">{b.salon_name}</div>
                      <div className="font-medium text-gray-900">
                        {b.master_domain ? (
                          <Link
                            to={`/domain/${b.master_domain}`}
                            className="text-[#2e7d32] hover:underline"
                          >
                            {b.master_name}
                          </Link>
                        ) : (
                          b.master_name
                        )}
                      </div>
                    </div>
                  ) : salonsEnabled && b.salon_name && b.salon_name !== '-' ? (
                    <div className="text-[13px] font-medium text-gray-900 mt-0.5 truncate">{b.salon_name}</div>
                  ) : b.master_name && b.master_name !== '-' ? (
                    <div className="text-[13px] font-medium text-gray-900 mt-0.5">
                      {b.master_domain ? (
                        <Link
                          to={`/domain/${b.master_domain}`}
                          className="text-[#2e7d32] hover:underline"
                        >
                          {b.master_name}
                        </Link>
                      ) : (
                        b.master_name
                      )}
                    </div>
                  ) : (
                    <span className="text-[12px] text-gray-500">—</span>
                  )
                return (
                  <div key={b.id} className="rounded-lg border border-gray-100 bg-white p-2.5 shadow-sm">
                    <div className="text-[13px] font-semibold text-gray-900 tabular-nums">
                      {formatDateShort(b.date)}
                    </div>
                    <div className="mt-0.5">{masterSalonBlock}</div>
                    <p className="text-[12px] text-gray-600 leading-snug line-clamp-2 mt-1">
                      {serviceDisplay}
                      <span className="text-gray-400"> · </span>
                      <span className="tabular-nums">{b.price} ₽</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-0.5 mt-2 pt-1.5 border-t border-gray-100">
                      <div className="inline-flex items-center justify-center w-10 h-10 min-w-[40px] min-h-[40px]">
                        {b.master_name && b.master_name !== '-' && (
                          <>
                            {b.indie_master_id ? (
                              <FavoriteButton
                                type="indie_master"
                                itemId={b.indie_master_id}
                                itemName={b.master_name}
                                size="sm"
                                isFavorite={isFav}
                                onFavoriteChange={handleFavoriteChange}
                              />
                            ) : b.master_id ? (
                              <FavoriteButton
                                type="master"
                                itemId={b.master_id}
                                itemName={b.master_name}
                                size="sm"
                                isFavorite={isFav}
                                onFavoriteChange={handleFavoriteChange}
                              />
                            ) : null}
                          </>
                        )}
                      </div>
                      <Tooltip text="Повторить запись" position="top" compact>
                        <button
                          type="button"
                          onClick={() => handleRepeatBooking(b)}
                          className="text-[#4CAF50] hover:bg-[#DFF5EC] rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                        >
                          <ArrowPathIcon className="w-4 h-4" />
                        </button>
                      </Tooltip>
                      <Tooltip text="Добавить заметку" position="top" compact>
                        <button
                          type="button"
                          onClick={() => handleNote(b)}
                          className="text-gray-600 hover:bg-gray-100 rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                      </Tooltip>
                      <Tooltip
                        content={
                          <div className="max-w-[200px]">
                            <div className="text-xs leading-tight">
                              Не понравилось. Отобразится при следующем бронировании
                            </div>
                          </div>
                        }
                        position="top"
                        compact
                      >
                        <button
                          type="button"
                          onClick={() => {}}
                          className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                        >
                          <HandThumbDownIcon className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[560px]">
            <thead>
              <tr className="border-b">
                <th className="py-2 px-3">{salonsEnabled ? 'Салон / Мастер' : 'Мастер'}</th>
                <th className="py-2 px-3">Услуга</th>
                <th className="py-2 px-3">Стоимость</th>
                <th className="py-2 px-3">Дата</th>
                <th className="py-2 px-3 w-[112px] text-center align-middle">Действия</th>
              </tr>
            </thead>
            <tbody>
              {(Array.isArray(bookings) ? bookings : []).slice(0, 3).map(b => (
                <tr key={b.id} className="border-b hover:bg-gray-100">
                  <td className="py-2 px-3">
                    {salonsEnabled && b.salon_name && b.salon_name !== '-' && b.master_name && b.master_name !== '-' ? (
                      <div>
                        <div>{b.salon_name}</div>
                        <div>
                          {b.master_domain ? (
                            <Link 
                              to={`/domain/${b.master_domain}`}
                              className="text-green-600 hover:text-green-800 hover:underline"
                            >
                              {b.master_name}
                            </Link>
                          ) : (
                            <span>{b.master_name}</span>
                          )}
                        </div>
                      </div>
                    ) : salonsEnabled && b.salon_name && b.salon_name !== '-' ? (
                      b.salon_name
                    ) : b.master_name && b.master_name !== '-' ? (
                      b.master_domain ? (
                        <Link 
                          to={`/domain/${b.master_domain}`}
                          className="text-green-600 hover:text-green-800 hover:underline"
                        >
                          {b.master_name}
                        </Link>
                      ) : (
                        <span>{b.master_name}</span>
                      )
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
                  <td className="py-2 px-3 whitespace-nowrap">{formatDateShort(b.date)}</td>
                  <td className="py-2 px-3 w-[112px] align-middle">
                    <div className="inline-flex items-center justify-start gap-[1px]">
                      <div className="inline-flex items-center justify-center w-7 h-7">
                        {b.master_name && b.master_name !== '-' && (() => {
                          const masterKey = getMasterKey(b)
                          const isFav = masterKey !== null && favoriteMasterIds.has(masterKey)
                          return (
                            <>
                              {b.indie_master_id ? (
                                <FavoriteButton
                                  type="indie_master"
                                  itemId={b.indie_master_id}
                                  itemName={b.master_name}
                                  size="sm"
                                  isFavorite={isFav}
                                  onFavoriteChange={handleFavoriteChange}
                                />
                              ) : b.master_id ? (
                                <FavoriteButton
                                  type="master"
                                  itemId={b.master_id}
                                  itemName={b.master_name}
                                  size="sm"
                                  isFavorite={isFav}
                                  onFavoriteChange={handleFavoriteChange}
                                />
                              ) : null}
                            </>
                          )
                        })()}
                      </div>
                      <Tooltip text="Повторить запись" position="top">
                        <div className="inline-flex items-center justify-center w-7 h-7">
                          <button
                            onClick={() => handleRepeatBooking(b)}
                            className="text-[#4CAF50] hover:bg-[#DFF5EC] rounded-md transition-colors"
                          >
                            <ArrowPathIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </Tooltip>
                      <Tooltip text="Добавить заметку" position="top">
                        <div className="inline-flex items-center justify-center w-7 h-7">
                          <button
                            onClick={() => handleNote(b)}
                            className="text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                          >
                            <PencilSquareIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </Tooltip>
                      <Tooltip 
                        content={
                          <div className="max-w-[200px]">
                            <div className="text-xs leading-tight">
                              Не понравилось. Отобразится при следующем бронировании
                            </div>
                          </div>
                        }
                        position="top"
                      >
                        <div className="inline-flex items-center justify-center w-7 h-7">
                          <button
                            onClick={() => {}}
                            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                          >
                            <HandThumbDownIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
          </>
        )}
        </div>
        
        {/* Избранное (предпоследний блок) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 lg:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-3">
          <h2 className="text-lg lg:text-xl font-semibold">Избранные</h2>
          {favorites.length > 3 && (
            <button
              type="button"
              onClick={() => navigate('/client/favorites')}
              className="text-green-600 hover:text-green-800 font-medium text-sm px-3 py-2 rounded-lg hover:bg-green-50 transition-colors border border-green-200 w-full sm:w-auto text-center min-h-[40px]"
            >
              Посмотреть все
            </button>
          )}
        </div>
        {favoritesLoading ? (
          <div className="text-sm text-gray-500">Загрузка...</div>
        ) : favorites.length === 0 ? (
          <div className="text-sm text-gray-500">Нет избранных</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 justify-items-stretch sm:justify-items-start">
            {favorites.slice(0, 3).map((favorite, index) => (
              <div key={favorite.client_favorite_id || favorite.id || index} className="w-full sm:max-w-[280px]">
                {renderFavoriteCard(favorite)}
              </div>
            ))}
          </div>
        )}
        </div>
        
        {/* Мои баллы (последний блок, компактный) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 lg:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-3 lg:mb-4">
            <h2 className="text-lg lg:text-xl font-semibold">Мои баллы</h2>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleShowLoyaltyHistory}
                className="text-green-600 hover:text-green-800 font-medium text-sm px-3 py-2 rounded-lg hover:bg-green-50 transition-colors border border-green-200 text-center min-h-[40px]"
                data-testid="client-loyalty-history"
              >
                История
              </button>
              <button
                type="button"
                onClick={() => {/* TODO: navigate to loyalty history page */}}
                className="text-green-600 hover:text-green-800 font-medium text-sm px-3 py-2 rounded-lg hover:bg-green-50 transition-colors border border-green-200 text-center min-h-[40px]"
                data-testid="client-loyalty-view-all"
              >
                Посмотреть все
              </button>
            </div>
          </div>
          <ClientLoyaltyPoints />
        </div>
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
              <DashboardModalClose onClick={() => setShowEditBookingModal(false)} />
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
              <DashboardModalClose
                onClick={() => {
                  setShowTimeEditModal(false)
                  setDateAvailability({})
                  setSelectedDate('')
                  setNewDateTime('')
                  setAvailableSlots([])
                }}
              />
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-left flex justify-between items-center"
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
                            ? 'border-[#4CAF50] bg-[#DFF5EC] text-[#4CAF50]'
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
                  <h4 className="font-medium text-[#4CAF50] mb-2">Выбранное время:</h4>
                  <p className="text-[#4CAF50]">
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
              <DashboardModalClose onClick={() => setShowDeleteBookingModal(false)} />
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
                data-testid="client-booking-cancel-confirm"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[min(92dvh,92vh)] overflow-hidden flex flex-col min-h-0">
            <div className="flex justify-between items-start gap-2 px-4 pt-4 pb-2 border-b border-gray-100 shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 pr-2">Все будущие записи</h2>
              <DashboardModalClose onClick={() => setShowAllFutureBookingsModal(false)} />
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
              {allFutureLoading ? (
                <div className="text-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto" />
                  <p className="text-gray-600 mt-2 text-sm">Загрузка записей...</p>
                </div>
              ) : allFutureError ? (
                <div className="text-center py-8 text-red-600 text-sm" role="alert">
                  {allFutureError}
                </div>
              ) : allFutureBookings.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-sm">Нет будущих записей</div>
              ) : (
                <>
                  <div className="lg:hidden space-y-3">
                    {allFutureBookings.map((b) => {
                      const masterKey = getMasterKey(b)
                      const isFav = masterKey !== null && favoriteMasterIds.has(masterKey)
                      return (
                        <div key={b.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-semibold text-gray-900 tabular-nums">
                              {b.start_time ? formatDateTimeShort(b.start_time) : formatDateTimeShort(b.date)}
                            </div>
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold max-w-[55%] text-right leading-tight ${getBookingStatusColor(b.status)}`}
                            >
                              {getBookingStatusLabel(b.status)}
                            </span>
                          </div>
                          {salonsEnabled && b.salon_name && (
                            <p className="text-xs text-gray-500 mt-1 truncate">{b.salon_name}</p>
                          )}
                          {salonsEnabled && (b.branch_name || b.branch_address) && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                              {b.branch_name || 'Основной'}
                              {b.branch_address ? ` · ${b.branch_address}` : ''}
                            </p>
                          )}
                          <div className="text-sm text-gray-900 mt-1">
                            {b.master_domain ? (
                              <Link to={`/domain/${b.master_domain}`} className="text-[#2e7d32] font-medium hover:underline">
                                {b.master_name}
                              </Link>
                            ) : (
                              <span className="font-medium">{b.master_name}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-1 leading-snug">
                            {b.service_name
                              ? b.service_name.includes(' - ')
                                ? b.service_name.split(' - ')[0]
                                : b.service_name
                              : '—'}
                            <span className="text-gray-400"> · </span>
                            <span className="tabular-nums">{b.price} ₽</span>
                            <span className="text-gray-400"> · </span>
                            <span>{b.duration} мин</span>
                          </p>
                          <div className="flex flex-wrap items-center justify-end gap-1 mt-3 pt-2 border-t border-gray-100">
                            <div className="inline-flex items-center justify-center w-10 h-10 min-w-[40px] min-h-[40px]">
                              {b.master_name && b.master_name !== '-' && (
                                <>
                                  {b.indie_master_id ? (
                                    <FavoriteButton
                                      type="indie_master"
                                      itemId={b.indie_master_id}
                                      itemName={b.master_name}
                                      size="sm"
                                      isFavorite={isFav}
                                      onFavoriteChange={handleFavoriteChange}
                                    />
                                  ) : b.master_id ? (
                                    <FavoriteButton
                                      type="master"
                                      itemId={b.master_id}
                                      itemName={b.master_name}
                                      size="sm"
                                      isFavorite={isFav}
                                      onFavoriteChange={handleFavoriteChange}
                                    />
                                  ) : null}
                                </>
                              )}
                            </div>
                            {b.master_timezone?.trim?.() && (
                              <div className="inline-flex items-center justify-center w-10 h-10 min-w-[40px] min-h-[40px] relative">
                                <button
                                  type="button"
                                  onClick={() => setCalendarDropdownId(calendarDropdownId === b.id ? null : b.id)}
                                  className="text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                                  title="Добавить в календарь"
                                >
                                  <CalendarIcon className="w-4 h-4" />
                                </button>
                                {calendarDropdownId === b.id && (
                                  <div className="absolute right-0 top-full mt-1 z-[100] w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                      onClick={() => handleCalendarGoogle(b)}
                                    >
                                      <CalendarIcon className="w-4 h-4" /> Google Calendar
                                    </button>
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                      onClick={() => handleCalendarDownloadIcs(b)}
                                    >
                                      <CalendarIcon className="w-4 h-4" /> Скачать .ics
                                    </button>
                                    <button
                                      type="button"
                                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                      onClick={() => openCalendarEmailModal(b)}
                                    >
                                      <CalendarIcon className="w-4 h-4" /> Отправить на email
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => handleEditBooking(b)}
                              className="text-green-600 hover:text-green-900 hover:bg-green-50 rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                              title="Редактировать"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBooking(b)}
                              className="text-red-600 hover:text-red-900 hover:bg-red-50 rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                              title="Отменить"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="hidden lg:block overflow-x-auto -mx-1 px-1">
                    <table className="min-w-[960px] w-full text-left border-collapse text-sm">
                      <thead className="sticky top-0 bg-white z-10 shadow-sm">
                    <tr className="border-b">
                          {salonsEnabled && <th className="py-2 px-2">Салон</th>}
                          {salonsEnabled && <th className="py-2 px-2">Филиал</th>}
                          <th className="py-2 px-2">Мастер</th>
                          <th className="py-2 px-2">Услуга</th>
                          <th className="py-2 px-2">Стоимость</th>
                          <th className="py-2 px-2">Длит.</th>
                          <th className="py-2 px-2">Дата</th>
                          <th className="py-2 px-2">Время</th>
                          <th className="py-2 px-2">Статус</th>
                          <th className="py-2 px-2 text-center w-[200px]">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                        {allFutureBookings.map((b) => (
                          <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                            {salonsEnabled && <td className="py-2 px-2 align-top">{b.salon_name}</td>}
                        {salonsEnabled && (
                              <td className="py-2 px-2 align-top">
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
                        )}
                            <td className="py-2 px-2 align-top">{b.master_name}</td>
                            <td className="py-2 px-2 align-top">
                              {b.service_name
                                ? b.service_name.includes(' - ')
                                  ? b.service_name.split(' - ')[0]
                                  : b.service_name
                                : '-'}
                        </td>
                            <td className="py-2 px-2 align-top whitespace-nowrap">{b.price} ₽</td>
                            <td className="py-2 px-2 align-top whitespace-nowrap">
                              {b.duration != null ? `${b.duration} мин` : '—'}
                        </td>
                            <td className="py-2 px-2 align-top whitespace-nowrap">
                              {formatDateShort(b.start_time || b.date)}
                        </td>
                            <td className="py-2 px-2 align-top whitespace-nowrap">
                              {formatTimeOnly(b.start_time || b.date)}
                            </td>
                            <td className="py-2 px-2 align-top">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${getBookingStatusColor(b.status)}`}
                              >
                            {getBookingStatusLabel(b.status)}
                          </span>
                        </td>
                            <td className="py-2 px-2 text-right align-middle">
                              <div className="flex flex-wrap items-center justify-end gap-0.5">
                            <div className="inline-flex items-center justify-center w-8 h-8">
                                  {b.master_name &&
                                    b.master_name !== '-' &&
                                    (() => {
                                const masterKey = getMasterKey(b)
                                const isFav = masterKey !== null && favoriteMasterIds.has(masterKey)
                                return (
                                  <>
                                    {b.indie_master_id ? (
                                      <FavoriteButton
                                        type="indie_master"
                                        itemId={b.indie_master_id}
                                        itemName={b.master_name}
                                        size="sm"
                                        isFavorite={isFav}
                                        onFavoriteChange={handleFavoriteChange}
                                      />
                                    ) : b.master_id ? (
                                      <FavoriteButton
                                        type="master"
                                        itemId={b.master_id}
                                        itemName={b.master_name}
                                        size="sm"
                                        isFavorite={isFav}
                                        onFavoriteChange={handleFavoriteChange}
                                      />
                                    ) : null}
                                  </>
                                )
                              })()}
                            </div>
                                {b.master_timezone?.trim?.() && (
                                  <div className="inline-flex items-center justify-center w-8 h-8 relative">
                              <button 
                                      type="button"
                                      onClick={() => setCalendarDropdownId(calendarDropdownId === b.id ? null : b.id)}
                                      className="text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-md p-1"
                                      title="Календарь"
                                    >
                                      <CalendarIcon className="w-4 h-4" />
                                    </button>
                                    {calendarDropdownId === b.id && (
                                      <div className="absolute right-0 top-full mt-1 z-[100] w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                                        <button
                                          type="button"
                                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                          onClick={() => handleCalendarGoogle(b)}
                                        >
                                          <CalendarIcon className="w-4 h-4" /> Google
                                        </button>
                                        <button
                                          type="button"
                                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                          onClick={() => handleCalendarDownloadIcs(b)}
                                        >
                                          <CalendarIcon className="w-4 h-4" /> .ics
                                        </button>
                                        <button
                                          type="button"
                                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                                          onClick={() => openCalendarEmailModal(b)}
                                        >
                                          <CalendarIcon className="w-4 h-4" /> Email
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <button
                                  type="button"
                                onClick={() => handleEditBooking(b)}
                                className="text-green-600 hover:text-green-900 hover:bg-green-50 rounded-md p-1" 
                                title="Редактировать"
                              >
                                <PencilIcon className="w-4 h-4" />
                              </button>
                              <button 
                                  type="button"
                                onClick={() => handleDeleteBooking(b)}
                                className="text-red-600 hover:text-red-900 hover:bg-red-50 rounded-md p-1" 
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
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно всех прошедших записей */}
      {showAllPastBookingsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[min(92dvh,92vh)] overflow-hidden flex flex-col min-h-0">
            <div className="flex justify-between items-start gap-2 px-4 pt-4 pb-2 border-b border-gray-100 shrink-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 pr-2">Все прошедшие записи</h2>
              <DashboardModalClose onClick={() => setShowAllPastBookingsModal(false)} />
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3">
              {allPastLoading ? (
                <div className="text-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto" />
                  <p className="text-gray-600 mt-2 text-sm">Загрузка записей...</p>
                </div>
              ) : allPastError ? (
                <div className="text-center py-8 text-red-600 text-sm" role="alert">
                  {allPastError}
                </div>
              ) : allPastBookings.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-sm">Нет прошедших записей</div>
              ) : (
                <>
                  <div className="lg:hidden space-y-3">
                    {allPastBookings.map((b) => {
                      const masterKey = getMasterKey(b)
                      const isFav = masterKey !== null && favoriteMasterIds.has(masterKey)
                      const serviceDisplay = b.service_name
                        ? b.salon_name && b.salon_name !== '-'
                          ? b.service_name.split(' - ')[0]
                          : b.service_name
                        : '—'
                      return (
                        <div key={b.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold text-gray-900 tabular-nums">
                                {formatDateShort(b.date)}{' '}
                                <span className="text-gray-500 font-normal">
                                  {formatTimeOnly(b.start_time || b.date)}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {b.duration != null ? `${b.duration} мин` : '—'}
                  </p>
                </div>
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold max-w-[50%] text-right leading-tight ${getBookingStatusColor(b.status)}`}
                            >
                              {getBookingStatusLabel(b.status)}
                            </span>
                          </div>
                          {salonsEnabled && b.salon_name && b.salon_name !== '-' && (
                            <p className="text-xs text-gray-500 mt-1 truncate">{b.salon_name}</p>
                          )}
                          <div className="text-sm font-medium text-gray-900 mt-1">
                            {b.master_domain ? (
                              <Link to={`/domain/${b.master_domain}`} className="text-[#2e7d32] hover:underline">
                                {b.master_name}
                              </Link>
                            ) : (
                              b.master_name
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            {serviceDisplay}
                            <span className="text-gray-400"> · </span>
                            <span className="tabular-nums">{b.price} ₽</span>
                          </p>
                          <div className="flex flex-wrap items-center gap-1 mt-3 pt-2 border-t border-gray-100">
                            <div className="inline-flex items-center justify-center w-10 h-10 min-w-[40px] min-h-[40px]">
                              {b.master_name && b.master_name !== '-' && (
                                <>
                                  {b.indie_master_id ? (
                                    <FavoriteButton
                                      type="indie_master"
                                      itemId={b.indie_master_id}
                                      itemName={b.master_name}
                                      size="sm"
                                      isFavorite={isFav}
                                      onFavoriteChange={handleFavoriteChange}
                                    />
                                  ) : b.master_id ? (
                                    <FavoriteButton
                                      type="master"
                                      itemId={b.master_id}
                                      itemName={b.master_name}
                                      size="sm"
                                      isFavorite={isFav}
                                      onFavoriteChange={handleFavoriteChange}
                                    />
                                  ) : null}
                                </>
                              )}
                            </div>
                            <Tooltip text="Повторить запись" position="top" compact>
                              <button
                                type="button"
                                onClick={() => handleRepeatBooking(b)}
                                className="text-[#4CAF50] hover:bg-[#DFF5EC] rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                              >
                                <ArrowPathIcon className="w-5 h-5" />
                              </button>
                            </Tooltip>
                            <Tooltip text="Добавить заметку" position="top" compact>
                              <button
                                type="button"
                                onClick={() => handleNote(b)}
                                className="text-gray-600 hover:bg-gray-100 rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                              >
                                <PencilSquareIcon className="w-5 h-5" />
                              </button>
                            </Tooltip>
                            <Tooltip
                              content={
                                <div className="max-w-[200px]">
                                  <div className="text-xs leading-tight">
                                    Не понравилось. Отобразится при следующем бронировании
                                  </div>
                                </div>
                              }
                              position="top"
                              compact
                            >
                              <button
                                type="button"
                                onClick={() => {}}
                                className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                              >
                                <HandThumbDownIcon className="w-5 h-5" />
                              </button>
                            </Tooltip>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="hidden lg:block overflow-x-auto -mx-1 px-1">
                    <table className="min-w-[920px] w-full text-left border-collapse text-sm">
                      <thead className="sticky top-0 bg-white z-10 shadow-sm">
                    <tr className="border-b">
                          <th className="py-2 px-2">{salonsEnabled ? 'Салон / мастер' : 'Мастер'}</th>
                          <th className="py-2 px-2">Услуга</th>
                          <th className="py-2 px-2">Цена</th>
                          <th className="py-2 px-2">Длит.</th>
                          <th className="py-2 px-2">Дата</th>
                          <th className="py-2 px-2">Время</th>
                          <th className="py-2 px-2">Статус</th>
                          <th className="py-2 px-2 text-center w-[180px]">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                        {allPastBookings.map((b) => (
                          <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-2 px-2 align-top">
                              {salonsEnabled &&
                              b.salon_name &&
                              b.salon_name !== '-' &&
                              b.master_name &&
                              b.master_name !== '-' ? (
                            <div>
                                  <div className="text-gray-600 text-xs">{b.salon_name}</div>
                                  <div className="font-medium">{b.master_name}</div>
                            </div>
                          ) : salonsEnabled && b.salon_name && b.salon_name !== '-' ? (
                            b.salon_name
                          ) : b.master_name && b.master_name !== '-' ? (
                            <span>{b.master_name}</span>
                          ) : (
                            '-'
                          )}
                        </td>
                            <td className="py-2 px-2 align-top">
                              {b.service_name
                                ? b.salon_name && b.salon_name !== '-'
                                  ? b.service_name.split(' - ')[0]
                                  : b.service_name
                                : '-'}
                        </td>
                            <td className="py-2 px-2 align-top whitespace-nowrap">{b.price} ₽</td>
                            <td className="py-2 px-2 align-top whitespace-nowrap">
                              {b.duration != null ? `${b.duration} мин` : '—'}
                            </td>
                            <td className="py-2 px-2 align-top whitespace-nowrap">{formatDateShort(b.date)}</td>
                            <td className="py-2 px-2 align-top whitespace-nowrap">
                              {formatTimeOnly(b.start_time || b.date)}
                            </td>
                            <td className="py-2 px-2 align-top">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${getBookingStatusColor(b.status)}`}
                              >
                                {getBookingStatusLabel(b.status)}
                              </span>
                            </td>
                            <td className="py-2 px-2 align-middle">
                              <div className="inline-flex items-center justify-end gap-0.5 w-full flex-wrap">
                                <div className="inline-flex items-center justify-center w-8 h-8">
                                  {b.master_name &&
                                    b.master_name !== '-' &&
                                    (() => {
                                const masterKey = getMasterKey(b)
                                const isFav = masterKey !== null && favoriteMasterIds.has(masterKey)
                                return (
                                  <>
                                    {b.indie_master_id ? (
                                      <FavoriteButton
                                        type="indie_master"
                                        itemId={b.indie_master_id}
                                        itemName={b.master_name}
                                        size="sm"
                                        isFavorite={isFav}
                                        onFavoriteChange={handleFavoriteChange}
                                      />
                                    ) : b.master_id ? (
                                      <FavoriteButton
                                        type="master"
                                        itemId={b.master_id}
                                        itemName={b.master_name}
                                        size="sm"
                                        isFavorite={isFav}
                                        onFavoriteChange={handleFavoriteChange}
                                      />
                                    ) : null}
                                  </>
                                )
                              })()}
                            </div>
                            <Tooltip text="Повторить запись" position="top">
                                  <div className="inline-flex items-center justify-center w-8 h-8">
                                <button
                                      type="button"
                                  onClick={() => handleRepeatBooking(b)}
                                      className="text-[#4CAF50] hover:bg-[#DFF5EC] rounded-md p-1"
                                >
                                  <ArrowPathIcon className="w-5 h-5" />
                                </button>
                              </div>
                            </Tooltip>
                            <Tooltip text="Добавить заметку" position="top">
                                  <div className="inline-flex items-center justify-center w-8 h-8">
                                <button
                                      type="button"
                                  onClick={() => handleNote(b)}
                                      className="text-gray-600 hover:bg-gray-100 rounded-md p-1"
                                >
                                  <PencilSquareIcon className="w-5 h-5" />
                                </button>
                              </div>
                            </Tooltip>
                            <Tooltip 
                              content={
                                <div className="max-w-[200px]">
                                  <div className="text-xs leading-tight">
                                    Не понравилось. Отобразится при следующем бронировании
                                  </div>
                                </div>
                              }
                              position="top"
                            >
                                  <div className="inline-flex items-center justify-center w-8 h-8">
                                <button
                                      type="button"
                                  onClick={() => {}}
                                      className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md p-1"
                                >
                                  <HandThumbDownIcon className="w-5 h-5" />
                                </button>
                              </div>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                  </div>
                </>
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

      {/* Модальное окно истории баллов */}
      {showLoyaltyHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {selectedLoyaltyMaster 
                  ? `История баллов: ${selectedLoyaltyMaster.master_name}`
                  : 'История баллов'
                }
              </h2>
              <DashboardModalClose
                onClick={() => {
                  setShowLoyaltyHistoryModal(false)
                  setSelectedLoyaltyMaster(null)
                }}
              />
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {selectedLoyaltyMaster ? (
                // Показываем историю одного мастера
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b">
                      <th className="py-2 px-3">Тип</th>
                      <th className="py-2 px-3">Услуга</th>
                      <th className="py-2 px-3">Дата</th>
                      <th className="py-2 px-3">Баллы</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLoyaltyMaster.transactions.map((trans) => (
                      <tr key={trans.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded ${
                              trans.transaction_type === 'earned'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {trans.transaction_type === 'earned' ? 'Начислено' : 'Списано'}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {trans.service_name || '-'}
                        </td>
                        <td className="py-2 px-3">
                          {formatDateForLoyalty(trans.earned_at)}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`font-semibold ${
                              trans.transaction_type === 'earned'
                                ? 'text-green-600'
                                : 'text-red-600'
                            }`}
                          >
                            {trans.transaction_type === 'earned' ? '+' : '-'}{trans.points}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                // Показываем список мастеров
                <div className="space-y-3">
                  {loyaltyPoints.map((master) => (
                    <div 
                      key={master.master_id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div>
                        <div className="font-medium text-gray-900">{master.master_name}</div>
                        <div className="text-sm text-gray-600">{master.balance} баллов</div>
                      </div>
                      <button
                        onClick={() => setSelectedLoyaltyMaster(master)}
                        className="text-green-600 hover:text-green-800 font-medium text-sm px-4 py-2 rounded-lg hover:bg-green-50 transition-colors border border-green-200"
                      >
                        Открыть
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {selectedLoyaltyMaster && loyaltyPoints.length > 1 && (
              <div className="mt-4 pt-4 border-t">
                <button
                  onClick={() => setSelectedLoyaltyMaster(null)}
                  className="text-gray-600 hover:text-gray-800 text-sm"
                >
                  ← Назад к списку мастеров
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  )
} 