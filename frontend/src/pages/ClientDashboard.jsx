import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiGet, apiFetch } from '../utils/api'
import { PencilIcon, TrashIcon, ArrowPathIcon, PencilSquareIcon, HandThumbDownIcon, CalendarIcon, ChevronDownIcon, XMarkIcon, HeartIcon } from "@heroicons/react/24/outline"
import PasswordSetupModal from "../modals/PasswordSetupModal"
import ManagerInvitations from "../components/ManagerInvitations"
import RepeatBookingModal from "../modals/RepeatBookingModal"
import ClientNoteModal from '../modals/ClientNoteModal'
import FavoriteButton from '../components/FavoriteButton'
import { useFavorites } from '../contexts/FavoritesContext'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import Tooltip from '../components/Tooltip'
import { CalendarGrid as PublicCalendarGrid } from '../components/booking/PublicBookingCalendarGrid'
import {
  downloadClientBookingIcsFile,
  triggerIcsBlobDownload,
  icsDownloadFilename,
  fetchClientGoogleCalendarUrl,
  sendClientCalendarEmail,
} from '../utils/clientBookingCalendarActions'
import { ClientBookingPriceDisplay } from '../utils/clientBookingPrice'

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

/** Макс. время по последней операции лояльности (earned/spent) — для сортировки. */
function getLastLoyaltyActivityMs(master) {
  const txs = Array.isArray(master?.transactions) ? master.transactions : []
  let max = 0
  for (const t of txs) {
    const raw = t.earned_at ?? t.created_at
    if (!raw) continue
    const ms = new Date(raw).getTime()
    if (!Number.isNaN(ms)) max = Math.max(max, ms)
  }
  return max
}

/** Крестик закрытия модалок: SVG, без Unicode ✕ (iOS).
 * Единый паттерн кабинета: на mobile — pill F4F1EF 32×32, на desktop — белый круг 40×40 с border + shadow.
 * Совместим со всеми клиентскими модалками страницы. */
function DashboardModalClose({ onClick, ariaLabel = 'Закрыть' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative z-30 shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F4F1EF] text-[#6B6B6B] hover:bg-[#EAE4E0] focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 lg:h-10 lg:w-10 lg:rounded-full lg:bg-white lg:text-neutral-900 lg:shadow-md lg:ring-1 lg:ring-neutral-300 lg:hover:bg-neutral-50 lg:hover:ring-neutral-400"
      aria-label={ariaLabel}
    >
      <XMarkIcon className="h-4 w-4 lg:h-5 lg:w-5" strokeWidth={2} />
    </button>
  )
}

/**
 * Единый стиль кнопок клиентских модалок — выровнен под кабинет мастера.
 * Использовать через классы в JSX, без обёрток (минимизируем риск регрессий).
 *   PRIMARY:     `bg-[#4CAF50] text-white hover:bg-[#45A049]`
 *   SECONDARY:   `bg-white text-gray-900 border border-gray-300 hover:bg-gray-50`
 *   DESTRUCTIVE: `bg-red-600 text-white hover:bg-red-700`
 *   DESTRUCTIVE-OUTLINE: `border-2 border-red-300 text-red-600 hover:bg-red-50`
 * Размеры:  px-4 py-2 text-sm font-semibold rounded-lg.
 * Эта блокировка cosmetics — никаких новых сущностей, никаких изменений в обработчиках.
 */

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

function phraseFutureBookingsCount(n) {
  if (n === 0) return 'Нет будущих записей'
  const mod100 = n % 100
  const mod10 = n % 10
  let tail
  if (mod100 >= 11 && mod100 <= 14) tail = 'будущих записей'
  else if (mod10 === 1) tail = 'будущая запись'
  else if (mod10 >= 2 && mod10 <= 4) tail = 'будущие записи'
  else tail = 'будущих записей'
  return `${n} ${tail}`
}

function phraseFavoriteMastersCount(n) {
  if (n === 0) return 'Нет избранных мастеров'
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return `${n} избранных мастеров`
  if (mod10 === 1) return `${n} избранный мастер`
  if (mod10 >= 2 && mod10 <= 4) return `${n} избранных мастера`
  return `${n} избранных мастеров`
}

function dashboardWelcomeFirstName(user) {
  if (!user) return null
  const full = (user.full_name || '').trim()
  if (full) return full.split(/\s+/)[0]
  const first = (user.first_name || '').trim()
  if (first) return first
  const email = (user.email || '').trim()
  if (email.includes('@')) {
    const local = email.split('@')[0]
    if (local) return local
  }
  return null
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
  const [loyaltySummary, setLoyaltySummary] = useState({
    loading: true,
    totalBalance: null,
    totalReserved: 0,
    masters: [],
    error: false,
  })
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

  // Адаптеры для CalendarGrid из публичной страницы /m/:slug — переиспользуем
  // тот же визуальный календарь в TimeEdit-модалке. dateAvailability мапится
  // в Set<YYYY-MM-DD>; выходные и прошедшие даты выпиливаем (как было в inline-календаре).
  const timeEditAvailableDateSet = useMemo(() => {
    const set = new Set()
    const todayStr = new Date().toISOString().split('T')[0]
    for (const [dateStr, hasSlots] of Object.entries(dateAvailability)) {
      if (hasSlots !== true) continue
      if (dateStr < todayStr) continue
      const d = new Date(dateStr + 'T12:00:00')
      const dow = d.getDay()
      if (dow === 0 || dow === 6) continue // воскресенье/суббота — как в исходной логике
      set.add(dateStr)
    }
    return set
  }, [dateAvailability])
  const timeEditMinDateStr = useMemo(() => {
    const t = new Date()
    return t.toISOString().split('T')[0]
  }, [])
  const timeEditMaxDateStr = useMemo(() => {
    const t = new Date()
    t.setDate(t.getDate() + 90) // 3 месяца вперёд
    return t.toISOString().split('T')[0]
  }, [])

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
  const [showCalendarEmailModal, setShowCalendarEmailModal] = useState(false)
  const [calendarEmailBooking, setCalendarEmailBooking] = useState(null)
  const [calendarEmail, setCalendarEmail] = useState('')
  const [calendarAlarmMinutes, setCalendarAlarmMinutes] = useState(60)
  const [calendarEmailSending, setCalendarEmailSending] = useState(false)
  const { showToast } = useToast()
  const { user: authUser } = useAuth()

  const PAGE_SIZE = 20
  const [allFuturePage, setAllFuturePage] = useState(0)
  const [allPastPage, setAllPastPage] = useState(0)

  const [calendarMenu, setCalendarMenu] = useState({
    open: false,
    booking: null,
    anchorRect: null,
    top: 0,
    left: 0,
  })
  const calendarMenuRef = useRef(null)
  const calendarMenuAnchorRef = useRef(null)

  const closeCalendarMenu = () => {
    setCalendarMenu((prev) => (prev.open ? { open: false, booking: null, anchorRect: null, top: 0, left: 0 } : prev))
    calendarMenuAnchorRef.current = null
  }

  const openCalendarMenu = (booking, anchorEl) => {
    if (!booking || !anchorEl) return
    setCalendarMenu((prev) => {
      if (prev.open && prev.booking?.id === booking.id) {
        calendarMenuAnchorRef.current = null
        return { open: false, booking: null, anchorRect: null, top: 0, left: 0 }
      }
      const rect = anchorEl.getBoundingClientRect()
      calendarMenuAnchorRef.current = anchorEl
      return {
        open: true,
        booking,
        anchorRect: rect,
        top: rect.bottom + 8,
        left: Math.max(8, rect.right - 192),
      }
    })
  }

  useEffect(() => {
    if (!calendarMenu.open) return

    const onMouseDown = (e) => {
      const menuEl = calendarMenuRef.current
      const anchorEl = calendarMenuAnchorRef.current
      const target = e.target
      if (menuEl && menuEl.contains(target)) return
      if (anchorEl && anchorEl.contains(target)) return
      closeCalendarMenu()
    }

    const onAnyScroll = () => closeCalendarMenu()
    const onResize = () => closeCalendarMenu()

    document.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('scroll', onAnyScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('scroll', onAnyScroll, true)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarMenu.open])

  useEffect(() => {
    if (!calendarMenu.open || !calendarMenu.anchorRect) return
    const menuEl = calendarMenuRef.current
    if (!menuEl) return

    const rect = calendarMenu.anchorRect
    const menuRect = menuEl.getBoundingClientRect()
    const pad = 8

    const spaceBelow = window.innerHeight - rect.bottom - pad
    const spaceAbove = rect.top - pad
    let top = rect.bottom + 8
    if (menuRect.height > spaceBelow && spaceAbove >= menuRect.height) {
      top = rect.top - menuRect.height - 8
    }

    let left = rect.right - menuRect.width
    if (left < pad) left = pad
    const maxLeft = window.innerWidth - menuRect.width - pad
    if (left > maxLeft) left = maxLeft

    const maxTop = window.innerHeight - menuRect.height - pad
    if (top < pad) top = pad
    if (top > maxTop) top = maxTop

    setCalendarMenu((prev) => {
      if (!prev.open) return prev
      if (prev.top === top && prev.left === left) return prev
      return { ...prev, top, left }
    })
  }, [calendarMenu.open, calendarMenu.anchorRect])

  useEffect(() => {
    if (showAllFutureBookingsModal) setAllFuturePage(0)
  }, [showAllFutureBookingsModal])

  useEffect(() => {
    if (showAllPastBookingsModal) setAllPastPage(0)
  }, [showAllPastBookingsModal])

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

      setLoyaltySummary((prev) => ({ ...prev, loading: true, error: false }))
      try {
        const loyaltyData = await apiGet('/api/client/loyalty/points')
        setLoyaltySummary({
          loading: false,
          totalBalance: Number(loyaltyData?.total_balance ?? 0),
          totalReserved: Number(loyaltyData?.total_reserved ?? 0),
          masters: Array.isArray(loyaltyData?.masters) ? loyaltyData.masters : [],
          error: false,
        })
      } catch (error) {
        console.error('Ошибка при загрузке баллов:', error)
        setLoyaltySummary({ loading: false, totalBalance: null, totalReserved: 0, masters: [], error: true })
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
    closeCalendarMenu()
    try {
      const url = await fetchClientGoogleCalendarUrl(booking, 60)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      showToast(e?.response?.data?.detail || e?.message || 'Ошибка', 'error')
    }
  }

  const handleCalendarDownloadIcs = async (booking, alarmMinutes = 60) => {
    closeCalendarMenu()
    try {
      const blob = await downloadClientBookingIcsFile(booking, alarmMinutes)
      triggerIcsBlobDownload(blob, icsDownloadFilename(booking))
      showToast('Файл скачан', 'success')
    } catch (e) {
      showToast(e?.message || e?.response?.data?.detail || 'Ошибка', 'error')
    }
  }

  const openCalendarEmailModal = async (b) => {
    closeCalendarMenu()
    setCalendarEmailBooking(b)
    setCalendarAlarmMinutes(60)
    try {
      const me = await apiGet('/api/auth/users/me')
      setCalendarEmail(me?.email || '')
    } catch {
      setCalendarEmail('')
    }
    setShowCalendarEmailModal(true)
  }

  const handleCalendarSendEmail = async () => {
    if (!calendarEmailBooking) return
    if (!(calendarEmail || '').trim()) {
      showToast('В профиле не указан e-mail. Добавьте адрес в настройках профиля.', 'error')
      return
    }
    setCalendarEmailSending(true)
    try {
      await sendClientCalendarEmail(calendarEmailBooking, calendarAlarmMinutes)
      showToast('Отправлено', 'success')
      setShowCalendarEmailModal(false)
      setCalendarEmailBooking(null)
    } catch (e) {
      showToast(e?.response?.data?.detail || e?.message || 'Ошибка', 'error')
    } finally {
      setCalendarEmailSending(false)
    }
  }

  const handlePasswordSuccess = () => {
    // Обновляем данные после успешной установки/проверки пароля
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
    setSelectedDate(selectedBooking.date)

    // CalendarGrid стартует с текущего месяца. Грузим availability на сегодня —
    // чтобы при открытии модалки сразу были подсвечены доступные даты.
    // Если запись в другом месяце — догрузим её месяц тоже (одинокий useEffect
    // в CalendarGrid с onMonthChange делает остальное при навигации).
    const todayMonth = new Date()
    todayMonth.setDate(1)
    const bookingMonth = new Date(selectedBooking.date)
    bookingMonth.setDate(1)
    setCurrentMonth(todayMonth)
    await loadDateAvailabilityForMonth(todayMonth)
    if (bookingMonth.getMonth() !== todayMonth.getMonth() || bookingMonth.getFullYear() !== todayMonth.getFullYear()) {
      await loadMonthAvailability(bookingMonth)
    }
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
    setSelectedDate(date)
    setNewDateTime('')
    
    // Показываем загрузку для конкретной даты
    setLoadingDates(prev => new Set(prev).add(date))
    
    try {
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
    setSelectedRepeatBooking(booking)
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

  const handleNoteSaved = () => {
    // Заметка была сохранена или удалена
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

  const allFutureTotal = allFutureBookings.length
  const allFutureTotalPages = Math.max(1, Math.ceil(allFutureTotal / PAGE_SIZE))
  const allFuturePageSafe = Math.min(allFuturePage, allFutureTotalPages - 1)
  const allFutureStartIdx = allFuturePageSafe * PAGE_SIZE
  const allFutureEndIdx = Math.min(allFutureTotal, allFutureStartIdx + PAGE_SIZE)
  const allFuturePageItems = allFutureBookings.slice(allFutureStartIdx, allFutureEndIdx)

  const allPastTotal = allPastBookings.length
  const allPastTotalPages = Math.max(1, Math.ceil(allPastTotal / PAGE_SIZE))
  const allPastPageSafe = Math.min(allPastPage, allPastTotalPages - 1)
  const allPastStartIdx = allPastPageSafe * PAGE_SIZE
  const allPastEndIdx = Math.min(allPastTotal, allPastStartIdx + PAGE_SIZE)
  const allPastPageItems = allPastBookings.slice(allPastStartIdx, allPastEndIdx)

  const nextBookingHero = Array.isArray(futureBookings) && futureBookings.length > 0 ? futureBookings[0] : null

  const loyaltyTopMasters = useMemo(() => {
    const list = Array.isArray(loyaltySummary.masters) ? loyaltySummary.masters : []
    return [...list]
      .sort((a, b) => getLastLoyaltyActivityMs(b) - getLastLoyaltyActivityMs(a))
      .slice(0, 3)
  }, [loyaltySummary.masters])

  const favoriteMastersCount = useMemo(
    () =>
      favorites.filter((f) => f.type === 'master' || f.type === 'indie_master').length,
    [favorites]
  )

  const welcomeFirstName = useMemo(() => dashboardWelcomeFirstName(authUser), [authUser])

  const dashboardSummaryLine = useMemo(() => {
    const parts = []
    parts.push(
      futureLoading ? 'Записи…' : phraseFutureBookingsCount(Array.isArray(futureBookings) ? futureBookings.length : 0)
    )
    if (loyaltySummary.loading) {
      parts.push('Баллы…')
    } else if (loyaltySummary.error) {
      parts.push('Баллы лояльности недоступны')
    } else {
      parts.push(`${loyaltySummary.totalBalance ?? 0} баллов лояльности`)
    }
    parts.push(
      favoritesLoading ? 'Избранное…' : phraseFavoriteMastersCount(favoriteMastersCount)
    )
    return parts.join(' · ')
  }, [
    futureLoading,
    futureBookings,
    loyaltySummary.loading,
    loyaltySummary.error,
    loyaltySummary.totalBalance,
    favoritesLoading,
    favoriteMastersCount,
  ])

  return (
    <div className="py-2.5 lg:py-4 max-[760px]:py-3" data-testid="client-dashboard">
      <div className="content max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-7 max-[760px]:px-[18px] pb-6 lg:pb-8">
      <div className="content-head mb-2 max-w-[48rem]">
        <h1 className="m-0 text-[26px] font-bold tracking-[-0.03em] text-neutral-900 sm:text-[30px]">
          {welcomeFirstName ? (
            <>Добро пожаловать, {welcomeFirstName}&nbsp;👋</>
          ) : (
            <>Добро пожаловать&nbsp;👋</>
          )}
        </h1>
        <p className="sub m-0 mt-2 text-sm leading-snug text-[#6B6B6B]" data-testid="client-dashboard-summary">
          {dashboardSummaryLine}
        </p>
      </div>

      {/* Приглашения стать управляющим филиала */}
      <ManagerInvitations />

      <div className="top-row mt-2 mb-6 grid grid-cols-1 gap-2.5 max-lg:gap-2 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-stretch">
        {/* KPI: ближайшая запись */}
        <div className="min-w-0 flex flex-col lg:h-full">
          {futureLoading ? (
            <div className="next-booking h-full min-h-[200px] animate-pulse rounded-2xl bg-gradient-to-br from-[#4CAF50] to-[#43A047] p-6 lg:min-h-0" />
          ) : nextBookingHero ? (() => {
            const b = nextBookingHero
            const masterKey = getMasterKey(b)
            const isFav = masterKey !== null && favoriteMasterIds.has(masterKey)
            return (
              <div
                className="next-booking relative flex h-full min-h-[220px] flex-col overflow-hidden rounded-2xl border border-transparent bg-gradient-to-br from-[#4CAF50] to-[#43A047] p-[22px] text-white shadow-[0_10px_24px_-12px_rgba(76,175,80,0.45)] lg:min-h-0"
              >
                <h2 className="m-0 mb-1.5 text-2xl font-bold tracking-[-0.02em] text-white">Ближайшая запись</h2>
                <div className="master mb-[18px] text-sm text-white/[0.84]">
                  {b.master_domain ? (
                    <Link to={`/m/${b.master_domain}`} className="text-white/[0.92] underline-offset-2 hover:underline">
                      {b.master_name}
                    </Link>
                  ) : (
                    b.master_name
                  )}
                </div>
                <div className="mb-5 grid flex-1 gap-3 sm:grid-cols-2">
                  <div className="detail-item">
                    <div className="lbl mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/[0.72]">Дата и время</div>
                    <div className="val text-[15px] font-semibold text-white tabular-nums">
                      {b.start_time ? formatDateTimeShort(b.start_time) : formatDateTimeShort(b.date)}
                    </div>
                  </div>
                  <div className="detail-item">
                    <div className="lbl mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/[0.72]">Услуга</div>
                    <div className="val accent text-[15px] font-semibold text-white">
                      {b.service_name ? (b.service_name.includes(' - ') ? b.service_name.split(' - ')[0] : b.service_name) : '—'}
                    </div>
                  </div>
                  <div className="detail-item">
                    <div className="lbl mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/[0.72]">К оплате</div>
                    <div className="val text-[15px]">
                      <ClientBookingPriceDisplay booking={b} variant="hero" />
                    </div>
                  </div>
                  <div className="detail-item">
                    <div className="lbl mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/[0.72]">Статус</div>
                    <div className="val text-[15px] font-semibold text-white">{getBookingStatusLabel(b.status)}</div>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  {b.master_name && b.master_name !== '-' && (
                    <span className="inline-flex items-center rounded-[10px] border border-white/[0.18] bg-white/[0.12] p-0.5">
                      {b.indie_master_id ? (
                        <FavoriteButton type="indie_master" itemId={b.indie_master_id} itemName={b.master_name} size="sm" isFavorite={isFav} onFavoriteChange={handleFavoriteChange} className="!text-white" />
                      ) : b.master_id ? (
                        <FavoriteButton type="master" itemId={b.master_id} itemName={b.master_name} size="sm" isFavorite={isFav} onFavoriteChange={handleFavoriteChange} className="!text-white" />
                      ) : null}
                    </span>
                  )}
                  {b.master_timezone?.trim?.() && (
                    <button
                      type="button"
                      onClick={(e) => openCalendarMenu(b, e.currentTarget)}
                      className="action-btn inline-flex items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.18] bg-white/[0.12] px-3 py-2 text-[13px] font-medium text-white transition-all duration-150 hover:bg-white/[0.18] hover:border-white/[0.24] whitespace-nowrap"
                      title="Добавить в календарь"
                    >
                      <CalendarIcon className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleEditBooking(b)}
                    className="action-btn primary inline-flex items-center gap-1.5 rounded-[10px] border border-white bg-white px-4 py-2 text-[13px] font-medium text-[#2e7d32] transition-all duration-150 hover:bg-[#f7fffa] whitespace-nowrap"
                  >
                    <PencilIcon className="h-4 w-4" />
                    Изменить
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBooking(b)}
                    className="action-btn inline-flex items-center gap-1.5 rounded-[10px] border border-white/[0.18] bg-white/[0.12] px-4 py-2 text-[13px] font-medium text-white transition-all duration-150 hover:bg-white/[0.18] whitespace-nowrap"
                    data-testid="client-booking-cancel-btn"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Отменить
                  </button>
                </div>
              </div>
            )
          })() : (
            <div className="next-booking flex h-full min-h-[200px] flex-col justify-center rounded-2xl border border-transparent bg-gradient-to-br from-[#4CAF50] to-[#43A047] p-[22px] text-center text-white/90 shadow-[0_10px_24px_-12px_rgba(76,175,80,0.45)] lg:min-h-0">
              <p className="m-0 text-sm font-medium">Нет предстоящих записей</p>
            </div>
          )}
        </div>

        <div className="loyalty-card flex h-full min-h-0 min-w-0 flex-col rounded-2xl border border-[#E7E2DF] bg-white p-[18px] shadow-sm lg:min-h-[280px]">
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Мои баллы</div>
          <div className="points mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-neutral-900 tabular-nums min-h-[2.25rem] sm:text-[30px]">
            {loyaltySummary.loading ? (
              <span className="inline-block h-9 w-20 animate-pulse rounded-lg bg-neutral-100" aria-hidden />
            ) : loyaltySummary.error ? (
              <span className="text-lg font-semibold text-neutral-400">—</span>
            ) : (
              loyaltySummary.totalBalance
            )}
          </div>
          {!loyaltySummary.loading && !loyaltySummary.error && (
            <p className="mt-1 text-[11px] text-neutral-500 leading-snug">
              Доступно к списанию по всем мастерам
              {loyaltySummary.totalReserved > 0 && (
                <span className="block mt-0.5 text-amber-700">
                  В резерве: {loyaltySummary.totalReserved} баллов
                </span>
              )}
            </p>
          )}
          {loyaltySummary.error && (
            <p className="mt-1 text-[11px] text-neutral-500">Баланс временно недоступен</p>
          )}

          {!loyaltySummary.loading && !loyaltySummary.error && loyaltyTopMasters.length > 0 && (
            <ul className="mt-3 max-h-[200px] space-y-2 overflow-y-auto border-t border-[#EFEBE8] pt-3">
              {loyaltyTopMasters.map((m) => {
                const lastMs = getLastLoyaltyActivityMs(m)
                const lastLabel =
                  lastMs > 0 ? formatDateTimeShort(new Date(lastMs).toISOString()) : null
                return (
                  <li
                    key={m.master_id}
                    className="flex items-start justify-between gap-2 border-b border-[#F4F1EF] pb-2 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      {m.master_domain ? (
                        <Link
                          to={`/m/${m.master_domain}`}
                          className="block truncate text-[12px] font-semibold text-neutral-900 hover:text-[#2e7d32]"
                        >
                          {m.master_name}
                        </Link>
                      ) : (
                        <span className="block truncate text-[12px] font-semibold text-neutral-900">
                          {m.master_name}
                        </span>
                      )}
                      {lastLabel ? (
                        <span className="mt-0.5 block text-[10px] text-neutral-500">
                          Последняя операция: {lastLabel}
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-right">
                      <span className="block text-[12px] font-bold tabular-nums text-neutral-900">
                        {m.balance}
                      </span>
                      {Number(m.reserved_points ?? 0) > 0 && (
                        <span className="block text-[10px] font-medium text-amber-700 tabular-nums">
                          в резерве: {m.reserved_points}
                        </span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          {!loyaltySummary.loading &&
            !loyaltySummary.error &&
            loyaltySummary.totalBalance === 0 &&
            loyaltyTopMasters.length === 0 && (
              <p className="mt-3 border-t border-[#EFEBE8] pt-3 text-[11px] leading-snug text-neutral-500">
                Нет активных баллов по мастерам
              </p>
            )}

          <div className="mt-auto flex flex-wrap gap-1.5 border-t border-[#EFEBE8] pt-3">
            <button
              type="button"
              onClick={handleShowLoyaltyHistory}
              className="text-xs font-medium text-[#2e7d32] hover:text-[#1b5e20] px-2.5 py-1 rounded-lg hover:bg-green-50 transition-colors border border-green-200 min-h-[32px]"
              data-testid="client-loyalty-history"
            >
              История
            </button>
            <button
              type="button"
              onClick={handleShowLoyaltyHistory}
              className="text-xs font-medium text-[#2e7d32] hover:text-[#1b5e20] px-2.5 py-1 rounded-lg hover:bg-green-50 transition-colors border border-green-200 min-h-[32px]"
              data-testid="client-loyalty-view-all"
            >
              Все
            </button>
          </div>
        </div>
      </div>

      {/* Крупные секции: явные mt между блоками (не через space-y) */}
      <div>

        {/* ══ БУДУЩИЕ ЗАПИСИ ══ */}
        <section className="min-w-0" data-testid="client-future-bookings-section">
          <div className="section-head mb-1 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8F5E9] ring-1 ring-[#C8E6C9]/60">
                <CalendarIcon className="w-[18px] h-[18px] text-[#2e7d32]" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="m-0 text-base font-bold leading-tight tracking-[-0.01em] text-neutral-900" data-testid="client-bookings-title">
                    Будущие записи
                  </h3>
                  {!futureLoading && futureBookings.length > 0 && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold tabular-nums leading-none text-green-800">
                      {futureBookings.length}
                    </span>
                  )}
                </div>
                <p className="m-0 mt-0.5 hidden text-xs leading-snug text-neutral-500 sm:block">Запланированные визиты и быстрые действия</p>
              </div>
            </div>
            {futureBookings.length > 3 && (
              <button
                type="button"
                onClick={() => { loadAllFutureBookings(); setShowAllFutureBookingsModal(true) }}
                className="shrink-0 text-sm text-[#2e7d32] hover:text-[#1b5e20] font-semibold px-3 py-1.5 rounded-lg hover:bg-[#E8F5E9] transition-colors border border-[#C8E6C9] min-h-[36px]"
              >
                Все записи
              </button>
            )}
          </div>
          <div className="table-wrap overflow-hidden rounded-2xl border border-[#E7E2DF] bg-white shadow-sm">
          {futureLoading ? (
            <div className="px-5 py-6 space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="animate-pulse flex gap-4 items-center">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded-lg w-1/3" />
                    <div className="h-3 bg-gray-100 rounded-lg w-1/2" />
                  </div>
                  <div className="h-6 w-16 bg-gray-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : futureBookingsError ? (
            <div className="px-5 py-5">
              <p className="text-sm text-red-600" role="alert" data-testid="client-bookings-error">{futureBookingsError}</p>
            </div>
          ) : futureBookings.length === 0 ? (
            <div className="px-5 py-12 text-center" data-testid="client-bookings-empty">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F7F4F2] text-[#6B6B6B]">
                <CalendarIcon className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-neutral-700 m-0">Нет предстоящих записей</p>
              <p className="text-xs text-neutral-500 mt-1 m-0">Новые визиты появятся здесь после бронирования</p>
            </div>
          ) : (
            <div data-testid="client-bookings-list">
              {/* Mobile cards */}
              <div className="lg:hidden space-y-3 p-4">
                {(Array.isArray(futureBookings) ? futureBookings : []).slice(0, 3).map((b, idx) => {
                  const masterKey = getMasterKey(b)
                  const isFav = masterKey !== null && favoriteMasterIds.has(masterKey)
                  return (
                    <div
                      key={b.id}
                      className="rounded-xl border border-[#E7E2DF] bg-[#FAFAF9] p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                      data-testid={`client-booking-item-${idx}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[13px] font-semibold text-neutral-900 tabular-nums">
                          {b.start_time ? formatDateTimeShort(b.start_time) : formatDateTimeShort(b.date)}
                        </span>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold leading-tight ${getBookingStatusColor(b.status)}`}>
                          {getBookingStatusLabel(b.status)}
                        </span>
                      </div>
                      {salonsEnabled && b.salon_name && (
                        <p className="text-[11px] text-neutral-500 truncate mb-0.5">{b.salon_name}</p>
                      )}
                      {salonsEnabled && (b.branch_name || b.branch_address) && (
                        <p className="text-[11px] text-neutral-500 line-clamp-1 mb-0.5">
                          {b.branch_name || 'Основной'}{b.branch_address ? ` · ${b.branch_address}` : ''}
                        </p>
                      )}
                      <div className="text-[13px] font-medium text-neutral-900 mb-1">
                        {b.master_domain ? (
                          <Link to={`/m/${b.master_domain}`} className="text-[#2e7d32] hover:underline">{b.master_name}</Link>
                        ) : (b.master_name)}
                      </div>
                      <p className="text-xs text-neutral-600 mb-3 leading-snug">
                        {b.service_name ? (b.service_name.includes(' - ') ? b.service_name.split(' - ')[0] : b.service_name) : '—'}
                        <span className="text-neutral-300 mx-1">·</span>
                        <ClientBookingPriceDisplay booking={b} variant="inline" />
                        <span className="text-neutral-300 mx-1">·</span>
                        <span>{b.duration} мин</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-[#E7E2DF]/80">
                        <div className="inline-flex items-center justify-center w-9 h-9 min-w-[36px] min-h-[36px]">
                          {b.master_name && b.master_name !== '-' && (
                            <>
                              {b.indie_master_id ? (
                                <FavoriteButton type="indie_master" itemId={b.indie_master_id} itemName={b.master_name} size="sm" isFavorite={isFav} onFavoriteChange={handleFavoriteChange} />
                              ) : b.master_id ? (
                                <FavoriteButton type="master" itemId={b.master_id} itemName={b.master_name} size="sm" isFavorite={isFav} onFavoriteChange={handleFavoriteChange} />
                              ) : null}
                            </>
                          )}
                        </div>
                        {b.master_timezone?.trim?.() && (
                          <div className="relative inline-flex items-center justify-center w-9 h-9 min-w-[36px] min-h-[36px]">
                            <button
                              type="button"
                              onClick={(e) => openCalendarMenu(b, e.currentTarget)}
                              className="inline-flex items-center justify-center w-8 h-8 rounded-[10px] text-neutral-500 hover:text-[#1565C0] hover:bg-blue-50 transition-colors ring-1 ring-transparent hover:ring-blue-100"
                              title="Добавить в календарь"
                            >
                              <CalendarIcon className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEditBooking(b)}
                          className="inline-flex items-center justify-center w-9 h-9 min-w-[36px] min-h-[36px] rounded-[10px] text-neutral-500 hover:text-[#2e7d32] hover:bg-[#E8F5E9] transition-colors ring-1 ring-transparent hover:ring-[#C8E6C9]"
                          title="Редактировать"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBooking(b)}
                          className="inline-flex items-center justify-center w-9 h-9 min-w-[36px] min-h-[36px] rounded-[10px] text-neutral-500 hover:text-red-700 hover:bg-red-50 transition-colors ring-1 ring-transparent hover:ring-red-100"
                          title="Отменить"
                          data-testid={nextBookingHero && b.id === nextBookingHero.id ? undefined : 'client-booking-cancel-btn'}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto overflow-y-visible">
                <table className="tbl w-full text-sm min-w-[640px]">
                  <thead>
                    <tr>
                      {salonsEnabled && <th className="border-b border-[#E7E2DF] bg-[#F4F1EF] py-3.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-[#5C5C5C]">Салон</th>}
                      {salonsEnabled && <th className="border-b border-[#E7E2DF] bg-[#F4F1EF] py-3.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-[#5C5C5C]">Филиал</th>}
                      <th className="border-b border-[#E7E2DF] bg-[#F4F1EF] py-3.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-[#5C5C5C]">Мастер</th>
                      <th className="border-b border-[#E7E2DF] bg-[#F4F1EF] py-3.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-[#5C5C5C]">Услуга</th>
                      <th className="border-b border-[#E7E2DF] bg-[#F4F1EF] py-3.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-[#5C5C5C]">Стоимость</th>
                      <th className="border-b border-[#E7E2DF] bg-[#F4F1EF] py-3.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-[#5C5C5C]">Дата и время</th>
                      <th className="border-b border-[#E7E2DF] bg-[#F4F1EF] py-3.5 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-[#5C5C5C]">Статус</th>
                      <th className="border-b border-[#E7E2DF] bg-[#F4F1EF] py-3.5 px-4 text-right text-[11px] font-semibold uppercase tracking-wider text-[#5C5C5C] w-[128px]">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEBE8]">
                    {(Array.isArray(futureBookings) ? futureBookings : []).slice(0, 3).map((b, idx) => {
                      const masterKey = getMasterKey(b)
                      const isFav = masterKey !== null && favoriteMasterIds.has(masterKey)
                      return (
                        <tr key={b.id} className="hover:bg-[#FAFAF9] transition-colors" data-testid={`client-booking-item-${idx}`}>
                          {salonsEnabled && <td className="py-3.5 px-4 text-gray-600">{b.salon_name}</td>}
                          {salonsEnabled && (
                            <td className="py-3.5 px-4">
                              {b.branch_name ? (
                                <div>
                                  <div className="text-gray-800 font-medium text-sm">{b.branch_name}</div>
                                  {b.branch_address && <div className="text-xs text-gray-400 mt-0.5">{b.branch_address}</div>}
                                </div>
                              ) : <span className="text-gray-400 text-sm">Основной</span>}
                            </td>
                          )}
                          <td className="py-3.5 px-4">
                            {b.master_domain ? (
                              <Link to={`/m/${b.master_domain}`} className="text-[#2e7d32] hover:underline font-medium">{b.master_name}</Link>
                            ) : <span className="text-gray-800 font-medium">{b.master_name}</span>}
                          </td>
                          <td className="py-3.5 px-4 text-gray-600">
                            {b.service_name ? (b.service_name.includes(' - ') ? b.service_name.split(' - ')[0] : b.service_name) : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-gray-700 whitespace-nowrap">
                            <ClientBookingPriceDisplay booking={b} />
                          </td>
                          <td className="py-3.5 px-4 text-gray-600 tabular-nums whitespace-nowrap">
                            {b.start_time ? formatDateTimeShort(b.start_time) : formatDateTimeShort(b.date)}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getBookingStatusColor(b.status)}`}>
                              {getBookingStatusLabel(b.status)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-end gap-0.5">
                              <div className="inline-flex items-center justify-center w-8 h-8">
                                {b.master_name && b.master_name !== '-' && (() => {
                                  const mk = getMasterKey(b)
                                  const fav = mk !== null && favoriteMasterIds.has(mk)
                                  return (
                                    <>
                                      {b.indie_master_id ? (
                                        <FavoriteButton type="indie_master" itemId={b.indie_master_id} itemName={b.master_name} size="sm" isFavorite={fav} onFavoriteChange={handleFavoriteChange} />
                                      ) : b.master_id ? (
                                        <FavoriteButton type="master" itemId={b.master_id} itemName={b.master_name} size="sm" isFavorite={fav} onFavoriteChange={handleFavoriteChange} />
                                      ) : null}
                                    </>
                                  )
                                })()}
                              </div>
                              {b.master_timezone?.trim?.() && (
                                <div className="relative inline-flex items-center justify-center w-8 h-8">
                                  <button
                                    type="button"
                                    onClick={(e) => openCalendarMenu(b, e.currentTarget)}
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                    title="Добавить в календарь"
                                  >
                                    <CalendarIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                              <div className="inline-flex items-center justify-center w-8 h-8">
                                <button
                                  onClick={() => handleEditBooking(b)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                                  title="Редактировать"
                                >
                                  <PencilIcon className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="inline-flex items-center justify-center w-8 h-8">
                                <button
                                  onClick={() => handleDeleteBooking(b)}
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  title="Отменить"
                                  data-testid={nextBookingHero && b.id === nextBookingHero.id ? undefined : 'client-booking-cancel-btn'}
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          </div>
        </section>

        {/* ══ ИЗБРАННОЕ ══ */}
        <section className="mt-6 min-w-0" data-testid="client-dashboard-favorites-section">
          <div className="section-head mb-1 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF8E7] ring-1 ring-[#F5D99C]/50">
                <HeartIcon className="w-[18px] h-[18px] text-[#C98817]" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h3 className="m-0 text-base font-bold leading-tight tracking-[-0.01em] text-neutral-900">Избранные</h3>
                <p className="m-0 mt-0.5 hidden text-xs leading-snug text-neutral-500 sm:block">Салоны, мастера и услуги в одном месте</p>
              </div>
            </div>
            {favorites.length > 3 && (
              <button
                type="button"
                onClick={() => navigate('/client/favorites')}
                className="shrink-0 text-sm text-[#2e7d32] hover:text-[#1b5e20] font-semibold px-3 py-1.5 rounded-lg hover:bg-[#E8F5E9] transition-colors border border-[#C8E6C9] min-h-[36px]"
              >
                Все избранное
              </button>
            )}
          </div>
          <div className="table-wrap overflow-hidden rounded-2xl border border-[#E7E2DF] bg-white shadow-sm">
            {favoritesLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse h-[88px] rounded-xl bg-[#F4F1EF]" />
                ))}
              </div>
            ) : favorites.length === 0 ? (
              <div className="px-4 py-3 text-center sm:px-5 sm:py-3.5">
                <div className="mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[#F7F4F2] text-neutral-400">
                  <HeartIcon className="h-4 w-4" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-medium text-neutral-700 m-0">Пока нет избранного</p>
                <p className="text-xs text-neutral-500 mt-0.5 m-0 max-w-sm mx-auto leading-snug">Добавляйте мастеров и услуги в избранное при бронировании — они появятся здесь</p>
              </div>
            ) : (
              <div className="p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {favorites.slice(0, 6).map((favorite, index) => {
                    let title = 'Избранное'
                    let name = favorite.favorite_name || 'Название не указано'
                    let masterDomain = null
                    if (favorite.type === 'salon' && favorite.salon) {
                      title = 'Салон'; name = favorite.salon.name || favorite.favorite_name || 'Салон'
                    } else if (favorite.type === 'master' && favorite.master) {
                      title = 'Мастер'; name = favorite.master.user?.full_name || favorite.favorite_name || 'Мастер'; masterDomain = favorite.master.domain || null
                    } else if (favorite.type === 'indie_master') {
                      title = 'Мастер'
                      if (favorite.indie_master && favorite.indie_master.user) {
                        name = favorite.indie_master.user.full_name || favorite.favorite_name || 'Мастер'; masterDomain = favorite.indie_master.domain || null
                      } else { name = favorite.favorite_name || 'Мастер' }
                    } else if (favorite.type === 'service' && favorite.service) {
                      title = 'Услуга'; name = favorite.service.name || favorite.favorite_name || 'Услуга'
                    } else {
                      title = favorite.type === 'salon' ? 'Салон' : favorite.type === 'master' ? 'Мастер' : favorite.type === 'indie_master' ? 'Мастер' : favorite.type === 'service' ? 'Услуга' : 'Избранное'
                    }
                    return (
                      <div
                        key={favorite.client_favorite_id || favorite.id || index}
                        className="flex min-h-[92px] items-stretch justify-between gap-3 rounded-xl border border-[#E7E2DF] bg-[#FAFAF9] p-4 shadow-[0_1px_0_rgba(0,0,0,0.04)] transition-colors hover:border-[#81C784]/70 hover:bg-white"
                        data-testid={`client-dashboard-favorite-card-${index}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">{title}</div>
                          {masterDomain ? (
                            <Link to={`/m/${masterDomain}`} className="text-sm font-semibold text-[#2e7d32] hover:underline line-clamp-2">{name}</Link>
                          ) : (
                            <div className="text-sm font-semibold text-neutral-900 line-clamp-2">{name}</div>
                          )}
                        </div>
                        <div className="shrink-0 flex items-start pt-0.5">
                          {(favorite.type === 'master' && favorite.master_id) && (
                            <FavoriteButton type="master" itemId={favorite.master_id} itemName={name} size="sm" onFavoriteChange={handleFavoriteChange} />
                          )}
                          {(favorite.type === 'indie_master' && favorite.indie_master_id) && (
                            <FavoriteButton type="indie_master" itemId={favorite.indie_master_id} itemName={name} size="sm" onFavoriteChange={handleFavoriteChange} />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ══ ПРОШЕДШИЕ ЗАПИСИ ══ */}
        <section className="mt-6 min-w-0">
          <div className="section-head mb-1 flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50">
                <svg className="w-[18px] h-[18px] text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="m-0 text-base font-bold leading-tight tracking-[-0.01em] text-neutral-900">Прошедшие записи</h3>
            </div>
            {bookings.length > 3 && (
              <button
                type="button"
                onClick={() => { loadAllPastBookings(); setShowAllPastBookingsModal(true) }}
                className="shrink-0 text-sm text-green-600 hover:text-green-800 font-medium px-3 py-1.5 rounded-lg hover:bg-green-50 transition-colors border border-green-200 min-h-[36px]"
              >
                Все записи
              </button>
            )}
          </div>
          <div className="table-wrap overflow-hidden rounded-2xl border border-[#E7E2DF] bg-white shadow-sm">
          {loading ? (
            <div className="px-5 py-6 space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="animate-pulse flex gap-4 items-center">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded-lg w-1/4" />
                    <div className="h-3 bg-gray-100 rounded-lg w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : pastBookingsError ? (
            <div className="px-5 py-5">
              <p className="text-sm text-red-600" role="alert">{pastBookingsError}</p>
            </div>
          ) : bookings.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F7F4F2] text-neutral-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-sm font-medium text-neutral-700 m-0">Нет прошедших записей</p>
              <p className="text-xs text-neutral-500 mt-1 m-0">История появится после завершённых визитов</p>
            </div>
          ) : (
            <>
              {/* Mobile */}
              <div className="lg:hidden py-1" data-testid="client-past-bookings-list-mobile">
                {(Array.isArray(bookings) ? bookings : []).slice(0, 3).map((b) => {
                  const masterKey = getMasterKey(b)
                  const isFav = masterKey !== null && favoriteMasterIds.has(masterKey)
                  const serviceDisplay = b.service_name
                    ? b.salon_name && b.salon_name !== '-' ? b.service_name.split(' - ')[0] : b.service_name
                    : '—'
                  const masterSalonBlock =
                    salonsEnabled && b.salon_name && b.salon_name !== '-' && b.master_name && b.master_name !== '-' ? (
                      <div>
                        <div className="text-[11px] text-gray-400 truncate">{b.salon_name}</div>
                        <div className="text-[13px] font-medium text-gray-900">
                          {b.master_domain ? (
                            <Link to={`/m/${b.master_domain}`} className="text-[#2e7d32] hover:underline">{b.master_name}</Link>
                          ) : b.master_name}
                        </div>
                      </div>
                    ) : salonsEnabled && b.salon_name && b.salon_name !== '-' ? (
                      <div className="text-[13px] font-medium text-gray-900 truncate">{b.salon_name}</div>
                    ) : b.master_name && b.master_name !== '-' ? (
                      <div className="text-[13px] font-medium text-gray-900">
                        {b.master_domain ? (
                          <Link to={`/m/${b.master_domain}`} className="text-[#2e7d32] hover:underline">{b.master_name}</Link>
                        ) : b.master_name}
                      </div>
                    ) : (
                      <span className="text-[12px] text-gray-400">—</span>
                    )
                  return (
                    <div key={b.id} className="past-card mx-3 mb-2.5 flex flex-col gap-2 rounded-xl border border-[#E7E2DF] bg-white p-4 shadow-sm first:mt-3 last:mb-3">
                      <div className="min-w-0 w-full">
                      <div className="text-[13px] font-semibold text-gray-900 tabular-nums mb-1.5">{formatDateShort(b.date)}</div>
                      <div className="mb-1">{masterSalonBlock}</div>
                      <p className="text-xs text-gray-500 mb-2.5">
                        {serviceDisplay}
                        <span className="text-gray-300 mx-1">·</span>
                        <ClientBookingPriceDisplay booking={b} variant="inline" />
                      </p>
                      <div className="flex items-center gap-0.5">
                        <div className="inline-flex items-center justify-center w-9 h-9 min-w-[36px] min-h-[36px]">
                          {b.master_name && b.master_name !== '-' && (
                            <>
                              {b.indie_master_id ? (
                                <FavoriteButton type="indie_master" itemId={b.indie_master_id} itemName={b.master_name} size="sm" isFavorite={isFav} onFavoriteChange={handleFavoriteChange} />
                              ) : b.master_id ? (
                                <FavoriteButton type="master" itemId={b.master_id} itemName={b.master_name} size="sm" isFavorite={isFav} onFavoriteChange={handleFavoriteChange} />
                              ) : null}
                            </>
                          )}
                        </div>
                        <Tooltip text="Повторить запись" position="top" compact>
                          <button
                            type="button"
                            onClick={() => handleRepeatBooking(b)}
                            className="inline-flex items-center justify-center w-9 h-9 min-w-[36px] min-h-[36px] rounded-lg text-slate-400 hover:text-[#4CAF50] hover:bg-green-50 transition-colors"
                          >
                            <ArrowPathIcon className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip text="Добавить заметку" position="top" compact>
                          <button
                            type="button"
                            onClick={() => handleNote(b)}
                            className="inline-flex items-center justify-center w-9 h-9 min-w-[36px] min-h-[36px] rounded-lg text-slate-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <PencilSquareIcon className="w-4 h-4" />
                          </button>
                        </Tooltip>
                        <Tooltip
                          content={<div className="max-w-[200px] text-xs leading-tight">Не понравилось. Отобразится при следующем бронировании</div>}
                          position="top"
                          compact
                        >
                          <button
                            type="button"
                            onClick={() => {}}
                            className="inline-flex items-center justify-center w-9 h-9 min-w-[36px] min-h-[36px] rounded-lg text-slate-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                          >
                            <HandThumbDownIcon className="w-4 h-4" />
                          </button>
                        </Tooltip>
                      </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Desktop */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="tbl w-full text-sm min-w-[520px]">
                  <thead>
                    <tr>
                      <th className="border-b border-[#E7E2DF] bg-[#F7F4F2] py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">{salonsEnabled ? 'Салон / Мастер' : 'Мастер'}</th>
                      <th className="border-b border-[#E7E2DF] bg-[#F7F4F2] py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Услуга</th>
                      <th className="border-b border-[#E7E2DF] bg-[#F7F4F2] py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Стоимость</th>
                      <th className="border-b border-[#E7E2DF] bg-[#F7F4F2] py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">Дата</th>
                      <th className="border-b border-[#E7E2DF] bg-[#F7F4F2] py-3 px-4 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B] w-[112px]">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(Array.isArray(bookings) ? bookings : []).slice(0, 3).map(b => {
                      const mk = getMasterKey(b)
                      const fav = mk !== null && favoriteMasterIds.has(mk)
                      return (
                        <tr key={b.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="py-3.5 px-4">
                            {salonsEnabled && b.salon_name && b.salon_name !== '-' && b.master_name && b.master_name !== '-' ? (
                              <div>
                                <div className="text-xs text-gray-400 mb-0.5">{b.salon_name}</div>
                                <div className="font-medium text-gray-800">
                                  {b.master_domain ? <Link to={`/m/${b.master_domain}`} className="text-[#2e7d32] hover:underline">{b.master_name}</Link> : b.master_name}
                                </div>
                              </div>
                            ) : salonsEnabled && b.salon_name && b.salon_name !== '-' ? (
                              <span className="text-gray-700">{b.salon_name}</span>
                            ) : b.master_name && b.master_name !== '-' ? (
                              b.master_domain ? <Link to={`/m/${b.master_domain}`} className="text-[#2e7d32] hover:underline font-medium">{b.master_name}</Link> : <span className="text-gray-800 font-medium">{b.master_name}</span>
                            ) : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-gray-600">
                            {b.service_name ? (b.salon_name && b.salon_name !== '-' ? b.service_name.split(' - ')[0] : b.service_name) : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-gray-700 whitespace-nowrap">
                            <ClientBookingPriceDisplay booking={b} />
                          </td>
                          <td className="py-3.5 px-4 text-gray-600 tabular-nums whitespace-nowrap">{formatDateShort(b.date)}</td>
                          <td className="py-3.5 px-4 w-[112px]">
                            <div className="inline-flex items-center justify-end gap-0.5 w-full">
                              <div className="inline-flex items-center justify-center w-8 h-8">
                                {b.master_name && b.master_name !== '-' && (() => {
                                  const mk2 = getMasterKey(b)
                                  const fav2 = mk2 !== null && favoriteMasterIds.has(mk2)
                                  return (
                                    <>
                                      {b.indie_master_id ? (
                                        <FavoriteButton type="indie_master" itemId={b.indie_master_id} itemName={b.master_name} size="sm" isFavorite={fav2} onFavoriteChange={handleFavoriteChange} />
                                      ) : b.master_id ? (
                                        <FavoriteButton type="master" itemId={b.master_id} itemName={b.master_name} size="sm" isFavorite={fav2} onFavoriteChange={handleFavoriteChange} />
                                      ) : null}
                                    </>
                                  )
                                })()}
                              </div>
                              <Tooltip text="Повторить запись" position="top" compact>
                                <button onClick={() => handleRepeatBooking(b)} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-[#4CAF50] hover:bg-green-50 transition-colors" aria-label="Повторить запись">
                                  <ArrowPathIcon className="w-4 h-4" />
                                </button>
                              </Tooltip>
                              <Tooltip text="Добавить заметку" position="top" compact>
                                <button onClick={() => handleNote(b)} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" aria-label="Добавить заметку">
                                  <PencilSquareIcon className="w-4 h-4" />
                                </button>
                              </Tooltip>
                              <Tooltip
                                content={<div className="max-w-[200px] text-xs leading-tight">Не понравилось. Отобразится при следующем бронировании</div>}
                                position="top"
                                compact
                              >
                                <button onClick={() => {}} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" aria-label="Не понравилось">
                                  <HandThumbDownIcon className="w-4 h-4" />
                                </button>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          </div>
        </section>

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
        <div className="fixed inset-0 z-[80] isolate bg-black/70 lg:flex lg:items-center lg:justify-center lg:bg-black/60">
          <div
            className="fixed inset-x-0 bottom-0 top-[calc(6rem+env(safe-area-inset-top,0px))] flex flex-col overflow-hidden bg-white lg:relative lg:inset-auto lg:mx-4 lg:h-auto lg:max-h-[85vh] lg:max-w-md lg:rounded-xl lg:shadow-xl lg:w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-edit-booking-title"
          >
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#E7E2DF] bg-white px-4 py-[14px] lg:px-5">
              <h2 id="client-edit-booking-title" className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-snug text-[#2D2D2D] lg:text-lg">
                Редактирование записи
              </h2>
              <DashboardModalClose onClick={() => setShowEditBookingModal(false)} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5 space-y-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Услуга</label>
                <p className="mt-0.5 text-sm font-medium text-gray-900">{selectedBooking.service_name}</p>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Мастер</label>
                <p className="mt-0.5 text-sm font-medium text-gray-900">{selectedBooking.master_name}</p>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Дата и время</label>
                <p className="mt-0.5 text-sm font-medium text-gray-900">
                  {selectedBooking.start_time ? formatDate(selectedBooking.start_time) : formatDate(selectedBooking.date)}
                </p>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Статус</label>
                <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${getBookingStatusColor(selectedBooking.status)}`}>
                  {getBookingStatusLabel(selectedBooking.status)}
                </span>
              </div>
            </div>

            <div className="border-t border-[#E7E2DF] bg-white px-4 py-3 lg:px-5 flex flex-col-reverse gap-2 lg:flex-row lg:justify-end">
              <button
                type="button"
                onClick={() => setShowEditBookingModal(false)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-gray-900 border border-gray-300 hover:bg-gray-50"
              >
                Закрыть
              </button>
              <button
                type="button"
                onClick={handleTimeEdit}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#4CAF50] text-white hover:bg-[#45A049]"
              >
                Изменить время
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно изменения времени */}
      {showTimeEditModal && selectedBooking && (
        <div className="fixed inset-0 z-[80] isolate bg-black/70 lg:flex lg:items-center lg:justify-center lg:bg-black/60">
          <div
            className="fixed inset-x-0 bottom-0 top-[calc(6rem+env(safe-area-inset-top,0px))] flex flex-col overflow-hidden bg-white lg:relative lg:inset-auto lg:mx-4 lg:h-auto lg:max-h-[85vh] lg:max-w-3xl lg:rounded-xl lg:shadow-xl lg:w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-time-edit-title"
          >
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#E7E2DF] bg-white px-4 py-[14px] lg:px-5">
              <h2 id="client-time-edit-title" className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-snug text-[#2D2D2D] lg:text-lg">
                Изменение времени записи
              </h2>
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

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5 space-y-6">
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

              {/* Выбор даты — общий CalendarGrid с публичной страницы /m/:slug */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Выберите дату
                  </label>
                  {selectedDate && (
                    <span className="text-xs text-gray-500 tabular-nums">
                      {new Date(selectedDate).toLocaleDateString('ru-RU', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </div>
                <PublicCalendarGrid
                  availableDateSet={timeEditAvailableDateSet}
                  minDateStr={timeEditMinDateStr}
                  maxDateStr={timeEditMaxDateStr}
                  selectedDate={selectedDate || null}
                  onSelectDate={(dateStr) => handleDateChange(dateStr)}
                  onMonthChange={({ year, month }) => {
                    const next = new Date(year, month, 1)
                    setCurrentMonth(next)
                    if (selectedBooking) loadMonthAvailability(next)
                  }}
                />
                {availabilityLoading && (
                  <p className="text-xs text-gray-500 mt-2">Загрузка доступности дат...</p>
                )}
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
            
            <div className="border-t border-[#E7E2DF] bg-white px-4 py-3 lg:px-5 flex flex-col-reverse gap-2 lg:flex-row lg:justify-end">
              <button
                type="button"
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
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                disabled={timeEditLoading}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleTimeEditConfirm}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#4CAF50] text-white hover:bg-[#45A049] disabled:opacity-50"
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
        <div className="fixed inset-0 z-[80] isolate bg-black/70 lg:flex lg:items-center lg:justify-center lg:bg-black/60">
          <div
            className="fixed inset-x-0 bottom-0 max-h-[88vh] flex flex-col overflow-hidden bg-white rounded-t-2xl lg:relative lg:inset-auto lg:mx-4 lg:h-auto lg:max-h-[85vh] lg:max-w-md lg:rounded-xl lg:shadow-xl lg:w-full lg:rounded-t-xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="client-cancel-title"
            aria-describedby="client-cancel-desc"
          >
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#E7E2DF] bg-white px-4 py-[14px] lg:px-5">
              <h2 id="client-cancel-title" className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-snug text-[#2D2D2D] lg:text-lg">
                Отмена записи
              </h2>
              <DashboardModalClose onClick={() => setShowDeleteBookingModal(false)} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:px-5 space-y-3">
              <p id="client-cancel-desc" className="text-sm text-gray-700">
                Вы действительно хотите отменить запись на <strong>«{selectedBooking.service_name}»</strong>?
              </p>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-sm text-gray-800">
                <div><strong>Дата:</strong> {selectedBooking.start_time ? formatDate(selectedBooking.start_time) : formatDate(selectedBooking.date)}</div>
                <div className="mt-1"><strong>Мастер:</strong> {selectedBooking.master_name}</div>
              </div>
            </div>

            <div className="border-t border-[#E7E2DF] bg-white px-4 py-3 lg:px-5 flex flex-col-reverse gap-2 lg:flex-row lg:justify-end">
              <button
                type="button"
                onClick={() => setShowDeleteBookingModal(false)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-white text-gray-900 border border-gray-300 hover:bg-gray-50"
              >
                Не отменять
              </button>
              <button
                type="button"
                onClick={handleDeleteBookingConfirm}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700"
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
        <div className="fixed inset-0 z-50 isolate bg-black/70 lg:flex lg:items-center lg:justify-center lg:bg-black/60">
          <div
            className="fixed inset-x-0 bottom-0 top-[calc(6rem+env(safe-area-inset-top,0px))] flex flex-col overflow-hidden bg-white lg:relative lg:inset-auto lg:mx-4 lg:h-auto lg:max-h-[85vh] lg:max-w-5xl lg:rounded-xl lg:shadow-xl lg:w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-all-future-title"
          >
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#E7E2DF] bg-white px-4 py-[14px] lg:px-5">
              <h2 id="client-all-future-title" className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-snug text-[#2D2D2D] lg:text-lg">
                Все будущие записи
              </h2>
              <DashboardModalClose onClick={() => setShowAllFutureBookingsModal(false)} />
            </div>

            {!allFutureLoading && !allFutureError && allFutureBookings.length > 0 && (
              <div className="border-b border-[#E7E2DF] bg-white px-4 py-2.5 lg:px-5 flex items-center justify-between gap-2 text-xs text-gray-500">
                <span className="tabular-nums">
                  Показано {allFutureTotal === 0 ? 0 : allFutureStartIdx + 1}–{allFutureEndIdx} из {allFutureTotal}
                </span>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    onClick={() => setAllFuturePage((p) => Math.max(0, p - 1))}
                    disabled={allFuturePageSafe === 0}
                  >
                    Назад
                  </button>
                  <div className="tabular-nums px-1">
                    {allFuturePageSafe + 1}/{allFutureTotalPages}
                  </div>
                  <button
                    type="button"
                    className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    onClick={() => setAllFuturePage((p) => Math.min(allFutureTotalPages - 1, p + 1))}
                    disabled={allFuturePageSafe >= allFutureTotalPages - 1}
                  >
                    Вперёд
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 lg:px-5">
              {allFutureLoading ? (
                <div className="text-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4CAF50] mx-auto" />
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
                    {allFuturePageItems.map((b) => {
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
                              <Link to={`/m/${b.master_domain}`} className="text-[#2e7d32] font-medium hover:underline">
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
                            <ClientBookingPriceDisplay booking={b} variant="inline" />
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
                              <div className="inline-flex items-center justify-center w-10 h-10 min-w-[40px] min-h-[40px]">
                                <button
                                  type="button"
                                  onClick={(e) => openCalendarMenu(b, e.currentTarget)}
                                  className="text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-md p-2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center"
                                  title="Добавить в календарь"
                                >
                                  <CalendarIcon className="w-4 h-4" />
                                </button>
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
                    <tr className="border-b border-[#E7E2DF]">
                          {salonsEnabled && <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Салон</th>}
                          {salonsEnabled && <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Филиал</th>}
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Мастер</th>
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Услуга</th>
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Стоимость</th>
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Длит.</th>
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Дата</th>
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Время</th>
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Статус</th>
                          <th className="py-2.5 px-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 w-[200px]">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                        {allFuturePageItems.map((b) => (
                          <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                            {salonsEnabled && <td className="py-3 px-3 align-top">{b.salon_name}</td>}
                        {salonsEnabled && (
                              <td className="py-3 px-3 align-top">
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
                            <td className="py-3 px-3 align-top">
                              {b.master_domain ? (
                                <Link to={`/m/${b.master_domain}`} className="text-[#2e7d32] hover:underline font-medium">
                                  {b.master_name}
                                </Link>
                              ) : (
                                b.master_name
                              )}
                            </td>
                            <td className="py-3 px-3 align-top">
                              {b.service_name
                                ? b.service_name.includes(' - ')
                                  ? b.service_name.split(' - ')[0]
                                  : b.service_name
                                : '-'}
                        </td>
                            <td className="py-3 px-3 align-top whitespace-nowrap">
                              <ClientBookingPriceDisplay booking={b} />
                            </td>
                            <td className="py-3 px-3 align-top whitespace-nowrap">
                              {b.duration != null ? `${b.duration} мин` : '—'}
                        </td>
                            <td className="py-3 px-3 align-top whitespace-nowrap">
                              {formatDateShort(b.start_time || b.date)}
                        </td>
                            <td className="py-3 px-3 align-top whitespace-nowrap">
                              {formatTimeOnly(b.start_time || b.date)}
                            </td>
                            <td className="py-3 px-3 align-top">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${getBookingStatusColor(b.status)}`}
                              >
                            {getBookingStatusLabel(b.status)}
                          </span>
                        </td>
                            <td className="py-3 px-3 text-right align-middle">
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
                                  <div className="inline-flex items-center justify-center w-8 h-8">
                              <button
                                      type="button"
                                      onClick={(e) => openCalendarMenu(b, e.currentTarget)}
                                      className="text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-md p-1"
                                      title="Календарь"
                                    >
                                      <CalendarIcon className="w-4 h-4" />
                                    </button>
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
        <div className="fixed inset-0 z-50 isolate bg-black/70 lg:flex lg:items-center lg:justify-center lg:bg-black/60">
          <div
            className="fixed inset-x-0 bottom-0 top-[calc(6rem+env(safe-area-inset-top,0px))] flex flex-col overflow-hidden bg-white lg:relative lg:inset-auto lg:mx-4 lg:h-auto lg:max-h-[85vh] lg:max-w-5xl lg:rounded-xl lg:shadow-xl lg:w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-all-past-title"
          >
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#E7E2DF] bg-white px-4 py-[14px] lg:px-5">
              <h2 id="client-all-past-title" className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-snug text-[#2D2D2D] lg:text-lg">
                Все прошедшие записи
              </h2>
              <DashboardModalClose onClick={() => setShowAllPastBookingsModal(false)} />
            </div>

            {!allPastLoading && !allPastError && allPastBookings.length > 0 && (
              <div className="border-b border-[#E7E2DF] bg-white px-4 py-2.5 lg:px-5 flex items-center justify-between gap-2 text-xs text-gray-500">
                <span className="tabular-nums">
                  Показано {allPastTotal === 0 ? 0 : allPastStartIdx + 1}–{allPastEndIdx} из {allPastTotal}
                </span>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    onClick={() => setAllPastPage((p) => Math.max(0, p - 1))}
                    disabled={allPastPageSafe === 0}
                  >
                    Назад
                  </button>
                  <div className="tabular-nums px-1">
                    {allPastPageSafe + 1}/{allPastTotalPages}
                  </div>
                  <button
                    type="button"
                    className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    onClick={() => setAllPastPage((p) => Math.min(allPastTotalPages - 1, p + 1))}
                    disabled={allPastPageSafe >= allPastTotalPages - 1}
                  >
                    Вперёд
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-3 lg:px-5">
              {allPastLoading ? (
                <div className="text-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4CAF50] mx-auto" />
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
                    {allPastPageItems.map((b) => {
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
                              <Link to={`/m/${b.master_domain}`} className="text-[#2e7d32] hover:underline">
                                {b.master_name}
                              </Link>
                            ) : (
                              b.master_name
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            {serviceDisplay}
                            <span className="text-gray-400"> · </span>
                            <ClientBookingPriceDisplay booking={b} variant="inline" />
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
                    <tr className="border-b border-[#E7E2DF]">
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{salonsEnabled ? 'Салон / мастер' : 'Мастер'}</th>
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Услуга</th>
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Цена</th>
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Длит.</th>
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Дата</th>
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Время</th>
                          <th className="py-2.5 px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Статус</th>
                          <th className="py-2.5 px-3 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 w-[180px]">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                        {allPastPageItems.map((b) => (
                          <tr key={b.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-3 align-top">
                              {salonsEnabled &&
                              b.salon_name &&
                              b.salon_name !== '-' &&
                              b.master_name &&
                              b.master_name !== '-' ? (
                            <div>
                                  <div className="text-gray-600 text-xs">{b.salon_name}</div>
                                  <div className="font-medium">
                                    {b.master_domain ? (
                                      <Link to={`/m/${b.master_domain}`} className="text-[#2e7d32] hover:underline">
                                        {b.master_name}
                                      </Link>
                                    ) : (
                                      b.master_name
                                    )}
                                  </div>
                            </div>
                          ) : salonsEnabled && b.salon_name && b.salon_name !== '-' ? (
                            b.salon_name
                          ) : b.master_name && b.master_name !== '-' ? (
                            b.master_domain ? (
                              <Link to={`/m/${b.master_domain}`} className="text-[#2e7d32] hover:underline font-medium">
                                {b.master_name}
                              </Link>
                            ) : (
                              <span className="font-medium">{b.master_name}</span>
                            )
                          ) : (
                            '-'
                          )}
                        </td>
                            <td className="py-3 px-3 align-top">
                              {b.service_name
                                ? b.salon_name && b.salon_name !== '-'
                                  ? b.service_name.split(' - ')[0]
                                  : b.service_name
                                : '-'}
                        </td>
                            <td className="py-3 px-3 align-top whitespace-nowrap">
                              <ClientBookingPriceDisplay booking={b} />
                            </td>
                            <td className="py-3 px-3 align-top whitespace-nowrap">
                              {b.duration != null ? `${b.duration} мин` : '—'}
                            </td>
                            <td className="py-3 px-3 align-top whitespace-nowrap">{formatDateShort(b.date)}</td>
                            <td className="py-3 px-3 align-top whitespace-nowrap">
                              {formatTimeOnly(b.start_time || b.date)}
                            </td>
                            <td className="py-3 px-3 align-top">
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${getBookingStatusColor(b.status)}`}
                              >
                                {getBookingStatusLabel(b.status)}
                              </span>
                            </td>
                            <td className="py-3 px-3 align-middle">
                              <div className="inline-flex items-center justify-end gap-1 w-full whitespace-nowrap">
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
                                <Tooltip text="Повторить запись" position="top" compact>
                                  <button
                                    type="button"
                                    onClick={() => handleRepeatBooking(b)}
                                    className="inline-flex items-center justify-center w-8 h-8 text-[#4CAF50] hover:bg-[#DFF5EC] rounded-md"
                                    aria-label="Повторить запись"
                                  >
                                    <ArrowPathIcon className="w-5 h-5" />
                                  </button>
                                </Tooltip>
                                <Tooltip text="Добавить заметку" position="top" compact>
                                  <button
                                    type="button"
                                    onClick={() => handleNote(b)}
                                    className="inline-flex items-center justify-center w-8 h-8 text-gray-600 hover:bg-gray-100 rounded-md"
                                    aria-label="Добавить заметку"
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
                                    className="inline-flex items-center justify-center w-8 h-8 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md"
                                    aria-label="Не понравилось"
                                  >
                                    <HandThumbDownIcon className="w-5 h-5" />
                                  </button>
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

      {/* Напоминание на e-mail: адрес берётся только с сервера (профиль клиента) */}
      {showCalendarEmailModal && calendarEmailBooking && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[80] p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl w-full sm:max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
            <div className="flex justify-between items-start gap-2 mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Напоминание на e-mail</h2>
              <DashboardModalClose
                onClick={() => {
                  setShowCalendarEmailModal(false)
                  setCalendarEmailBooking(null)
                }}
              />
            </div>
            {calendarEmail ? (
              <>
                <p className="text-sm text-gray-600 mb-1">Файл с записью будет отправлен на:</p>
                <p className="text-sm font-medium text-gray-900 break-all mb-4" data-testid="calendar-email-modal-address">
                  {calendarEmail}
                </p>
                <label className="block text-sm text-gray-700 mb-1">Напоминание за (мин.)</label>
                <select
                  value={calendarAlarmMinutes}
                  onChange={(e) => setCalendarAlarmMinutes(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 mb-4 text-sm"
                >
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <option key={m} value={m}>
                      {m} мин
                    </option>
                  ))}
                </select>
                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCalendarEmailModal(false)
                      setCalendarEmailBooking(null)
                    }}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-200 text-gray-800 hover:bg-gray-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleCalendarSendEmail}
                    disabled={calendarEmailSending}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg bg-[#4CAF50] text-white font-medium hover:bg-[#45a049] disabled:opacity-50"
                    data-testid="calendar-email-modal-send"
                  >
                    {calendarEmailSending ? 'Отправка…' : 'Отправить'}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3" data-testid="calendar-email-modal-no-email">
                В профиле не указан e-mail. Добавьте адрес в настройках профиля, чтобы получать
                напоминания.
              </p>
            )}
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
                          {trans.service_name ||
                            (trans.transaction_type === 'spent' ? 'Оплата записи баллами' : '-')}
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
                        <div className="text-sm text-gray-600">
                          {master.balance} баллов
                          {master.balance === 0 &&
                          Array.isArray(master.transactions) &&
                          master.transactions.length > 0
                            ? ' · есть история'
                            : ''}
                        </div>
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

      {/* Единый fixed dropdown календаря */}
      {calendarMenu.open && calendarMenu.booking && (
        <div className="fixed inset-0 z-[120] pointer-events-none">
          <div
            ref={calendarMenuRef}
            className="pointer-events-auto fixed w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-1"
            style={{ top: `${calendarMenu.top}px`, left: `${calendarMenu.left}px` }}
            role="menu"
          >
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
              onClick={() => handleCalendarGoogle(calendarMenu.booking)}
            >
              <CalendarIcon className="w-4 h-4 text-gray-400" /> Google Calendar
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
              onClick={() => handleCalendarDownloadIcs(calendarMenu.booking)}
            >
              <CalendarIcon className="w-4 h-4 text-gray-400" /> Скачать .ics
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
              onClick={() => openCalendarEmailModal(calendarMenu.booking)}
            >
              <CalendarIcon className="w-4 h-4 text-gray-400" /> Отправить на email
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
