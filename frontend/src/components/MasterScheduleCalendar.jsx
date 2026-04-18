import React, { useState, useRef, useEffect } from 'react'
import { CalendarDaysIcon, EyeSlashIcon, TrashIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { apiGet, apiPut, apiPost, apiDelete } from '../utils/api'
import { useHoverCloseDelay } from '../hooks/useHoverCloseDelay'
import { useToast } from '../contexts/ToastContext'
import {
  canPreVisitConfirmBooking,
  canConfirmPostVisit,
  isPast as isBookingPast,
} from '../utils/bookingOutcome'
import ConflictsList from './ConflictsList'
import PopupCard from './PopupCard'
import MasterDayDrawerModal from './MasterDayDrawerModal'
import MasterBookingDetailSheet from './master/mobile/MasterBookingDetailSheet'
import MasterBookingCancelSheet from './master/mobile/MasterBookingCancelSheet'
import { masterZClass } from '../config/masterOverlayZIndex'
import { isFutureCancelled } from './master/mobile/masterBookingShared'
import { calculateWeekOffset, getMonthName, getWeekDates } from '../utils/calendarUtils'
import MonthOverviewCalendar from './MonthOverviewCalendar'

/** Tailwind lg — совпадает с Phase 4 booking layer */
function useIsLgViewport() {
  const [isLg, setIsLg] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = () => setIsLg(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isLg
}

function normalizeBookingForDetail(booking) {
  if (!booking) return null
  const start_time =
    booking.start_time ||
    (booking.date && booking.time ? `${booking.date}T${booking.time}:00` : booking.start_time)
  return { ...booking, start_time }
}

function isSameCalendarDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => i) // 0:00 - 23:00

// CSS стили для выделенных ячеек
const selectedSlotStyles = `
  #schedule-table td.selected-slot {
    background-color: #DFF5EC !important;
    border-top: 1px solid #4CAF50 !important;
    border-right: 1px solid #4CAF50 !important;
    border-bottom: 1px solid #4CAF50 !important;
    border-left: 1px solid #4CAF50 !important;
    box-sizing: border-box !important;
  }
  
  .scroll-indicator {
    position: absolute;
    pointer-events: none;
    z-index: 20;
    background: rgba(76, 175, 80, 0.2);
    border: 2px solid #4CAF50;
    border-radius: 4px;
    transition: opacity 0.2s;
  }
  
  .scroll-indicator.top {
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
  }
  
  .scroll-indicator.bottom {
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
  }
`
const MINUTES = [0, 30]  // Слоты по 30 минут для компактности

/** Высота строки таймлайна (совпадает с style height на <tr> в таблице) */
const TIMELINE_ROW_HEIGHT_PX = 24
const SLOTS_PER_HOUR = MINUTES.length
/** Стартовая прокрутка: верх видимой области ≈ 08:00 */
const TIMELINE_INITIAL_SCROLL_HOUR = 8

function getScrollTopForTimelineHour(hour) {
  return hour * SLOTS_PER_HOUR * TIMELINE_ROW_HEIGHT_PX
}

function getTimeLabel(hour, minute) {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
}

function getSlotKey(date, hour, minute) {
  return `${date.toISOString().split('T')[0]}_${hour}_${minute}`
}

export default function MasterScheduleCalendar({
  schedule,
  onChange,
  currentWeekOffset,
  setCurrentWeekOffset,
  onWeekChange,
  allConflicts = [],
  masterSettings = null,
  onDayScheduleSaved = null,
  hasExtendedStats = false,
}) {
  // schedule: { [slotKey]: true/false } — true = рабочий, false = нерабочий
  const [selected, setSelected] = useState(new Set())
  const [dragging, setDragging] = useState(false)
  const [dragMode, setDragMode] = useState(null) // 'select' | 'deselect'
  const [saving, setSaving] = useState(false)
  const [dragStart, setDragStart] = useState(null) // { slotKey, dayIndex, timeIndex }
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [lastCreatedSchedule, setLastCreatedSchedule] = useState(null)
  const [showScrollIndicator, setShowScrollIndicator] = useState({ top: false, bottom: false })
  const [conflicts, setConflicts] = useState([])
  const [showConflictsModal, setShowConflictsModal] = useState(false)
  const [showMonthlyView, setShowMonthlyView] = useState(false)
  const [monthlySchedule, setMonthlySchedule] = useState({})
  const [monthlyScheduleLoading, setMonthlyScheduleLoading] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [scheduleRules, setScheduleRules] = useState(null)
  const [bookings, setBookings] = useState([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [popupVisible, setPopupVisible] = useState(false)
  const [popupBooking, setPopupBooking] = useState(null)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })
  const [dayDrawerOpen, setDayDrawerOpen] = useState(false)
  const [dayDrawerDateStr, setDayDrawerDateStr] = useState(null)
  const [dayDrawerSlots, setDayDrawerSlots] = useState([])

  const { showToast } = useToast()
  const isLg = useIsLgViewport()
  const [mobileDetailBooking, setMobileDetailBooking] = useState(null)
  const [cancelBookingId, setCancelBookingId] = useState(null)
  const [actionBookingId, setActionBookingId] = useState(null)

  useEffect(() => {
    if (isLg) {
      setMobileDetailBooking(null)
      setCancelBookingId(null)
    }
  }, [isLg])

  // Загружаем сохраненное расписание при инициализации
  React.useEffect(() => {
    const savedSchedule = localStorage.getItem('lastCreatedSchedule')
    if (savedSchedule) {
      try {
        setLastCreatedSchedule(JSON.parse(savedSchedule))
      } catch (error) {
        console.error('Ошибка при загрузке сохраненного расписания:', error)
        localStorage.removeItem('lastCreatedSchedule')
      }
    }
  }, [])

  // Загружаем правила расписания из API
  const loadScheduleRules = async () => {
    try {
      const data = await apiGet('/api/master/schedule/rules')
      if (data.has_settings) {
        setScheduleRules(data)
      }
    } catch (error) {
      console.error('Ошибка при загрузке правил расписания:', error)
    }
  }

  // Загружаем записи мастера
  const loadBookings = async () => {
    setBookingsLoading(true)
    try {
      const data = await apiGet('/api/master/bookings/detailed')
      setBookings(data)
    } catch (error) {
      console.error('Ошибка при загрузке записей:', error)
    } finally {
      setBookingsLoading(false)
    }
  }

  // Загружаем правила при инициализации
  React.useEffect(() => {
    loadScheduleRules()
    loadBookings()
  }, [])

  // Загружаем записи при изменении недели
  React.useEffect(() => {
    loadBookings()
  }, [currentWeekOffset])

  const tableRef = useRef(null)
  const dayHeaderLongPressTimerRef = useRef(null)
  const suppressNextDayLabelClickRef = useRef(false)

  /** Только lg: прокрутка таймлайна внутри таблицы. На mobile web без window.scrollTo — иначе страница «прыгает» к середине. */
  const scrollToTimelineInitialHour = React.useCallback(() => {
    if (showMonthlyView) return
    const wrap = tableRef.current
    if (!wrap || !isLg) return
    wrap.scrollTop = getScrollTopForTimelineHour(TIMELINE_INITIAL_SCROLL_HOUR)
  }, [isLg, showMonthlyView])

  // Добавляем стили в DOM
  React.useEffect(() => {
    const styleElement = document.createElement('style')
    styleElement.textContent = selectedSlotStyles
    document.head.appendChild(styleElement)
    
    return () => {
      document.head.removeChild(styleElement)
    }
  }, [])
  
  const weekDates = getWeekDates(currentWeekOffset)

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

  // Обработчики для поп-апа (задержка 500ms при уходе курсора)
  const { scheduleClose, cancelClose } = useHoverCloseDelay(500, () => {
    setPopupVisible(false)
    setPopupBooking(null)
  })

  const handleBookingMouseEnter = (booking, event) => {
    if (!isLg) return
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

  /** Resize lg: mobile sheets vs desktop popup не должны сосуществовать; сброс in-flight действий */
  useEffect(() => {
    setActionBookingId(null)
    if (isLg) {
      setMobileDetailBooking(null)
      setCancelBookingId(null)
    } else {
      cancelClose()
      setPopupVisible(false)
      setPopupBooking(null)
    }
  }, [isLg])

  /** Смена недели: закрыть overlays и снять drag, чтобы не оставались «висячие» состояния */
  useEffect(() => {
    setMobileDetailBooking(null)
    setCancelBookingId(null)
    cancelClose()
    setPopupVisible(false)
    setPopupBooking(null)
    setActionBookingId(null)
    setDragging(false)
    setDragMode(null)
    setDragStart(null)
  }, [currentWeekOffset])

  /** Те же guards и API, что в AllBookingsModal / Phase 4 (canPreVisit + canConfirmPostVisit + ранний return) */
  const handleMobileConfirm = async (bookingId, booking) => {
    const master = masterSettings?.master ?? null
    const b = normalizeBookingForDetail(booking)
    const preVisit = canPreVisitConfirmBooking(b, master, undefined, hasExtendedStats)
    const postVisit = canConfirmPostVisit(b, master)
    if (!preVisit && !postVisit) {
      showToast('Подтверждение для этой записи недоступно', 'error')
      return
    }
    try {
      setActionBookingId(bookingId)
      if (preVisit) {
        await apiPost(`/api/master/accounting/update-booking-status/${bookingId}?new_status=confirmed`)
        showToast('Принято', 'success', { quiet: true })
      } else {
        await apiPost(`/api/master/accounting/confirm-booking/${bookingId}`)
        showToast('Запись подтверждена', 'success')
      }
      await loadBookings()
      setMobileDetailBooking(null)
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Ошибка при подтверждении записи', 'error')
    } finally {
      setActionBookingId(null)
    }
  }

  const handleMobileCancelWithReason = async (bookingId, reason) => {
    setCancelBookingId(null)
    if (!reason) return
    try {
      setActionBookingId(bookingId)
      await apiPost(`/api/master/accounting/cancel-booking/${bookingId}?cancellation_reason=${reason}`)
      showToast('Запись отменена', 'success')
      await loadBookings()
      setMobileDetailBooking(null)
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Ошибка при отмене записи', 'error')
    } finally {
      setActionBookingId(null)
    }
  }

  const scheduleSectionTypeForBooking = (booking) =>
    isBookingPast(normalizeBookingForDetail(booking) || booking) ? 'past' : 'future'

  const openMobileBookingDetail = (booking) => {
    cancelClose()
    setPopupVisible(false)
    setPopupBooking(null)
    setMobileDetailBooking(normalizeBookingForDetail(booking))
  }

  // Функции навигации по неделям
  const goToPreviousWeek = () => {
    setCurrentWeekOffset(prev => prev - 1)
    setSelected(new Set()) // Очищаем выделение при смене недели
  }

  // Функции для месячного обзора
  const loadMonthlySchedule = async () => {
    const token = localStorage.getItem('access_token')
    if (!token) return

    setMonthlyScheduleLoading(true)
    try {
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth() + 1

      const data = await apiGet(`/api/master/schedule/monthly?year=${year}&month=${month}`)
      // Преобразуем слоты в формат для календаря
      const scheduleDict = {}
      data.slots.forEach(slot => {
        const key = `${slot.schedule_date}_${slot.hour}_${slot.minute}`
        scheduleDict[key] = {
          is_working: slot.is_working,
          work_type: slot.work_type,
          has_conflict: slot.has_conflict,
          conflict_type: slot.conflict_type,
          is_frozen: slot.is_frozen || false
        }
      })
      setMonthlySchedule(scheduleDict)
    } catch (error) {
      console.error('Ошибка загрузки месячного расписания:', error)
    } finally {
      setMonthlyScheduleLoading(false)
    }
  }

  const navigateToWeekForDate = (date) => {
    const weekOffset = calculateWeekOffset(date)
    if (onWeekChange) {
      onWeekChange(weekOffset)
    } else {
      setCurrentWeekOffset(weekOffset)
    }
    setShowMonthlyView(false)
  }

  const goToPreviousMonth = () => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev)
      newMonth.setMonth(prev.getMonth() - 1)
      return newMonth
    })
  }

  const goToNextMonth = () => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev)
      newMonth.setMonth(prev.getMonth() + 1)
      return newMonth
    })
  }

  const toggleView = () => {
    setShowMonthlyView(prev => !prev)
    setSelected(new Set()) // Очищаем выделение при смене вида
  }

  // Обработчики для кнопок конфликтов
  const handleGoToDate = (date) => {
    // Переключаемся на недельный вид
    setShowMonthlyView(false)
    
    // Вычисляем week_offset для нужной даты
    const today = new Date()
    const targetDate = new Date(date)
    const diffTime = targetDate - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    const weekOffset = Math.floor(diffDays / 7)
    
    setCurrentWeekOffset(weekOffset)
    
    // Прокручиваем к нужному дню
    setTimeout(() => {
      const dayOfWeek = targetDate.getDay()
      const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // Преобразуем в понедельник = 0
      if (tableRef.current) {
        const scrollPosition = adjustedDay * 160 // 160px ширина колонки
        tableRef.current.scrollLeft = scrollPosition
      }
    }, 100)
  }

  const handleRemovePersonalSchedule = async (date) => {
    try {
      const token = localStorage.getItem('access_token')
      if (!token) return

      // Удаляем все личные слоты для этой даты
      const updates = {}
      for (let hour = 0; hour < 24; hour++) {
        for (let minute of [0, 30]) {
          const key = `${date}_${hour}_${minute}`
          const slotData = schedule?.[key]
          if (slotData && slotData.is_working && slotData.work_type === 'personal') {
            updates[key] = false
          }
        }
      }

      // Обновляем расписание через callback
      onChange({ ...schedule, ...updates })

      // Отправляем изменения на сервер
      await apiPut('/api/master/schedule/weekly', { 
        slots: Object.entries(updates).map(([key, isWorking]) => {
          const [date, hour, minute] = key.split('_')
          return {
            schedule_date: date,
            hour: parseInt(hour),
            minute: parseInt(minute),
            is_working: isWorking
          }
        })
      })
    } catch (error) {
      console.error('Ошибка при удалении личного расписания:', error)
    }
  }

  const handleIgnoreConflict = (date) => {
    // Пока просто показываем уведомление
    alert(`Конфликт на ${date} будет проигнорирован. Эта функция будет реализована в следующих версиях.`)
  }

  const goToNextWeek = () => {
    setCurrentWeekOffset(prev => prev + 1)
    setSelected(new Set()) // Очищаем выделение при смене недели
  }

  const goToCurrentWeek = () => {
    setCurrentWeekOffset(0)
    setSelected(new Set()) // Очищаем выделение при смене недели
  }

  // Слоты: 7 дней * 48 слотов (30 мин)
  const slots = []
  for (let dayData of weekDates) {
    for (let hour of HOURS) {
      for (let minute of MINUTES) {
        slots.push({ date: dayData.date, hour, minute })
      }
    }
  }

  // Выделение слота: desktop — mousedown + drag; mobile web — только tap (onClick), без preventDefault / drag (иначе ломается вертикальный scroll)
  const handleSlotMouseDown = (slotKey, isActive, dayIndex, timeIndex) => (e) => {
    if (!isLg) return
    e.preventDefault()
    setDragging(true)
    setDragMode(selected.has(slotKey) ? 'deselect' : 'select')
    setDragStart({ slotKey, dayIndex, timeIndex })
    setSelected(prev => {
      const next = new Set(prev)
      if (prev.has(slotKey)) {
        next.delete(slotKey)
      } else {
        next.add(slotKey)
      }
      return next
    })
  }

  const handleSlotTapMobile = (slotKey) => (e) => {
    if (isLg) return
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(slotKey)) next.delete(slotKey)
      else next.add(slotKey)
      return next
    })
  }

  const handleSlotMouseEnter = (slotKey) => () => {
    if (!isLg || !dragging) return
    setSelected(prev => {
      const next = new Set(prev)
      if (dragMode === 'select') next.add(slotKey)
      if (dragMode === 'deselect') next.delete(slotKey)
      return next
    })
  }

  // Обработка перетаскивания с улучшенной логикой
  const handleSlotMouseMove = (slotKey, dayIndex, timeIndex) => () => {
    if (!isLg || !dragging || !dragStart) return
    
    // Выделяем все ячейки в прямоугольнике между начальной и текущей позицией
    const startDay = Math.min(dragStart.dayIndex, dayIndex)
    const endDay = Math.max(dragStart.dayIndex, dayIndex)
    const startTime = Math.min(dragStart.timeIndex, timeIndex)
    const endTime = Math.max(dragStart.timeIndex, timeIndex)
    
    setSelected(prev => {
      const next = new Set(prev)
      
      // Проходим по всем ячейкам в прямоугольнике
      for (let dayIdx = startDay; dayIdx <= endDay; dayIdx++) {
        for (let timeIdx = startTime; timeIdx <= endTime; timeIdx++) {
          const day = weekDates[dayIdx]
          const hour = Math.floor(timeIdx / 2)
          const minute = (timeIdx % 2) * 30
          const cellSlotKey = getSlotKey(day.date, hour, minute)
          
          if (dragMode === 'select') {
            next.add(cellSlotKey)
          } else if (dragMode === 'deselect') {
            next.delete(cellSlotKey)
          }
        }
      }
      
      return next
    })
  }

  const handleMouseUp = () => {
    setDragging(false)
    setDragMode(null)
    setDragStart(null)
    setShowScrollIndicator({ top: false, bottom: false })
  }

  // Автоматическая прокрутка при перетаскивании (только внутренний scroll на lg)
  const handleTableMouseMove = (e) => {
    if (!isLg || !dragging || !tableRef.current) return

    const tableRect = tableRef.current.getBoundingClientRect()
    const mouseY = e.clientY
    const scrollThreshold = 80 // пикселей от края для начала прокрутки
    const maxScrollSpeed = 8 // максимальная скорость прокрутки
    
    // Показываем индикаторы прокрутки
    const shouldScrollDown = mouseY > tableRect.bottom - scrollThreshold
    const shouldScrollUp = mouseY < tableRect.top + scrollThreshold
    
    setShowScrollIndicator({
      top: shouldScrollUp,
      bottom: shouldScrollDown
    })
    
    // Вычисляем скорость прокрутки в зависимости от близости к краю
    let scrollSpeed = 0
    
    // Прокрутка вниз
    if (shouldScrollDown) {
      const distance = mouseY - (tableRect.bottom - scrollThreshold)
      scrollSpeed = Math.min(maxScrollSpeed, Math.max(1, distance / 10))
      tableRef.current.scrollTop += scrollSpeed
    }
    // Прокрутка вверх
    else if (shouldScrollUp) {
      const distance = (tableRect.top + scrollThreshold) - mouseY
      scrollSpeed = Math.min(maxScrollSpeed, Math.max(1, distance / 10))
      tableRef.current.scrollTop -= scrollSpeed
    }
  }

  // Массовое выделение по клику на заголовок дня
  const openDayDrawerMenu = (day) => {
    const dateStr = day.date.toISOString().split('T')[0]
    const slotsForDay = []
    HOURS.forEach((hour) => {
      MINUTES.forEach((minute) => {
        const slotKey = getSlotKey(day.date, hour, minute)
        const cell = schedule?.[slotKey]
        slotsForDay.push({
          hour,
          minute,
          is_working: !!(cell?.is_working),
        })
      })
    })
    setDayDrawerDateStr(dateStr)
    setDayDrawerSlots(slotsForDay)
    setDayDrawerOpen(true)
  }

  const handleDayHeaderClick = (dayKey) => {
    const daySlots = slots.filter(s => s.date.toISOString().split('T')[0] === dayKey).map(s => getSlotKey(s.date, s.hour, s.minute))
    const allSelected = daySlots.every(slot => selected.has(slot))
    setSelected(prev => {
      const next = new Set(prev)
      daySlots.forEach(slot => {
        if (allSelected) next.delete(slot)
        else next.add(slot)
      })
      return next
    })
  }

  const clearDayHeaderLongPress = () => {
    if (dayHeaderLongPressTimerRef.current != null) {
      clearTimeout(dayHeaderLongPressTimerRef.current)
      dayHeaderLongPressTimerRef.current = null
    }
  }

  useEffect(() => () => clearDayHeaderLongPress(), [])

  /** Mobile web: удержание на подписи дня — настройки дня (без отдельной кнопки в шапке). */
  const handleDayHeaderPointerDownMobile = (day) => () => {
    if (isLg) return
    clearDayHeaderLongPress()
    dayHeaderLongPressTimerRef.current = window.setTimeout(() => {
      dayHeaderLongPressTimerRef.current = null
      suppressNextDayLabelClickRef.current = true
      window.setTimeout(() => {
        suppressNextDayLabelClickRef.current = false
      }, 600)
      openDayDrawerMenu(day)
    }, 480)
  }

  const handleDayHeaderPointerUpMobile = () => {
    clearDayHeaderLongPress()
  }

  const handleDayLabelClick = (dayKey) => (e) => {
    if (suppressNextDayLabelClickRef.current) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    handleDayHeaderClick(dayKey)
  }

  // Массовое выделение по клику на время (все дни в этот слот)
  const handleTimeHeaderClick = (hour, minute) => {
    const timeSlots = weekDates.map(d => getSlotKey(d.date, hour, minute))
    const allSelected = timeSlots.every(slot => selected.has(slot))
    setSelected(prev => {
      const next = new Set(prev)
      timeSlots.forEach(slot => {
        if (allSelected) next.delete(slot)
        else next.add(slot)
      })
      return next
    })
  }

  // Кнопки применения изменений
  const handleSetWorking = async (value) => {
    if (selected.size === 0) return
    setSaving(true)
    const updates = {}
    selected.forEach(slotKey => {
      updates[slotKey] = value
    })
    try {
      await onChange(updates)
      setSelected(new Set())
    } finally {
      setSaving(false)
    }
  }

  // Обработка разрешения конфликтов
  const handleResolveConflict = async (conflictId, action) => {
    try {
      // Здесь будет логика для разрешения конфликта
      // action может быть 'keep' (оставить) или 'remove' (удалить)
      console.log(`Разрешение конфликта ${conflictId}: ${action}`)
      
      // Обновляем список конфликтов, удаляя разрешенный конфликт
      setConflicts(prev => prev.filter(conflict => conflict.id !== conflictId))
    } catch (error) {
      console.error('Ошибка при разрешении конфликта:', error)
      alert('Ошибка при разрешении конфликта')
    }
  }

  // Автопрокрутка к 08:00 (раньше была ошибка 8*6*24 → clamp к max → визуально ~12:30)
  React.useEffect(() => {
    scrollToTimelineInitialHour()
    setTimeout(scrollToTimelineInitialHour, 50)
    setTimeout(scrollToTimelineInitialHour, 200)
    setTimeout(scrollToTimelineInitialHour, 500)
  }, [scrollToTimelineInitialHour])

  React.useEffect(() => {
    if (schedule) {
      scrollToTimelineInitialHour()
      setTimeout(scrollToTimelineInitialHour, 100)
    }
  }, [schedule, scrollToTimelineInitialHour])

  // Загружаем месячное расписание при изменении месяца или переключении вида
  React.useEffect(() => {
    if (showMonthlyView) {
      loadMonthlySchedule()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth, showMonthlyView])


  // Временные метки для вертикального скролла
  const visibleHours = Array.from({ length: 24 }, (_, i) => i) // 0:00 - 23:00
  

  // Компонент модального окна создания расписания
  const CreateScheduleModal = () => {
    const [scheduleType, setScheduleType] = useState('') // 'weekdays', 'monthdays', 'shift'
    const [weekdays, setWeekdays] = useState({}) // { 1: { start: '09:00', end: '18:00' }, ... }
    const [monthdays, setMonthdays] = useState({}) // { 1: { start: '09:00', end: '18:00' }, ... }
    const [shiftConfig, setShiftConfig] = useState({ workDays: 2, restDays: 1, startDate: '' })
    const [effectiveStartDate, setEffectiveStartDate] = useState('')
    const [validUntil, setValidUntil] = useState('')
    const [errors, setErrors] = useState({})

    const weekDays = [
      { id: 1, name: 'Понедельник' },
      { id: 2, name: 'Вторник' },
      { id: 3, name: 'Среда' },
      { id: 4, name: 'Четверг' },
      { id: 5, name: 'Пятница' },
      { id: 6, name: 'Суббота' },
      { id: 7, name: 'Воскресенье' }
    ]

    const validateTime = (start, end) => {
      if (!start || !end) return false
      const startTime = new Date(`2000-01-01T${start}:00`)
      const endTime = new Date(`2000-01-01T${end}:00`)
      return startTime < endTime
    }

    const handleWeekdayChange = (dayId, field, value) => {
      setWeekdays(prev => ({
        ...prev,
        [dayId]: {
          ...prev[dayId],
          [field]: value
        }
      }))
    }

    const handleMonthdayChange = (day, field, value) => {
      setMonthdays(prev => ({
        ...prev,
        [day]: {
          ...prev[day],
          [field]: value
        }
      }))
    }

    const addMonthday = () => {
      const newDay = prompt('Введите число месяца (1-31):')
      if (newDay && newDay >= 1 && newDay <= 31) {
        setMonthdays(prev => ({
          ...prev,
          [newDay]: { start: '09:00', end: '18:00' }
        }))
      }
    }

    const removeMonthday = (day) => {
      setMonthdays(prev => {
        const newDays = { ...prev }
        delete newDays[day]
        return newDays
      })
    }

    const validateForm = () => {
      const newErrors = {}

      if (!scheduleType) {
        newErrors.scheduleType = 'Выберите тип расписания'
      }

      if (scheduleType !== 'shift') {
        if (!effectiveStartDate) {
          newErrors.effectiveStartDate = 'Укажите дату начала действия расписания'
        } else {
          const date = new Date(effectiveStartDate)
          if (isNaN(date.getTime())) {
            newErrors.effectiveStartDate = 'Некорректная дата'
          }
        }
      }

      if (!validUntil) {
        newErrors.validUntil = 'Укажите дату окончания действия расписания'
      } else {
        // Проверяем формат YYYY-MM-DD
        const date = new Date(validUntil)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        if (isNaN(date.getTime())) {
          newErrors.validUntil = 'Некорректная дата'
        } else if (date < today) {
          newErrors.validUntil = 'Дата не может быть в прошлом'
        }
      }

      if (scheduleType === 'weekdays') {
        const hasSelectedDays = Object.keys(weekdays).length > 0
        if (!hasSelectedDays) {
          newErrors.weekdays = 'Выберите хотя бы один день недели'
        }
        
        Object.entries(weekdays).forEach(([dayId, times]) => {
          if (!validateTime(times.start, times.end)) {
            newErrors[`weekday_${dayId}`] = 'Время начала должно быть раньше времени окончания'
          }
        })
      }

      if (scheduleType === 'monthdays') {
        const hasSelectedDays = Object.keys(monthdays).length > 0
        if (!hasSelectedDays) {
          newErrors.monthdays = 'Выберите хотя бы одно число месяца'
        }
        
        Object.entries(monthdays).forEach(([day, times]) => {
          if (!validateTime(times.start, times.end)) {
            newErrors[`monthday_${day}`] = 'Время начала должно быть раньше времени окончания'
          }
        })
      }

      if (scheduleType === 'shift') {
        if (!shiftConfig.workDays || shiftConfig.workDays < 1) {
          newErrors.workDays = 'Количество рабочих дней должно быть больше 0'
        }
        if (!shiftConfig.restDays || shiftConfig.restDays < 0) {
          newErrors.restDays = 'Количество нерабочих дней не может быть отрицательным'
        }
        if (!shiftConfig.startDate) {
          newErrors.startDate = 'Укажите дату начала сменного графика'
        }
      }

      const startDateForValidation = scheduleType === 'shift' ? shiftConfig.startDate : effectiveStartDate
      if (startDateForValidation && validUntil) {
        const startDate = new Date(startDateForValidation)
        const endDate = new Date(validUntil)
        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate > endDate) {
          const message = 'Дата начала не может быть позже даты окончания'
          if (scheduleType === 'shift') {
            newErrors.startDate = message
          } else {
            newErrors.effectiveStartDate = message
          }
          newErrors.validUntil = message
        }
      }

      setErrors(newErrors)
      return Object.keys(newErrors).length === 0
    }

    const applySchedule = async () => {
      if (!validateForm()) return

      try {
        const token = localStorage.getItem('access_token')
        if (!token) {
          alert('Ошибка авторизации')
          return
        }

        // Подготавливаем данные для отправки
        const effectiveStartDateForApi = scheduleType === 'shift' ? shiftConfig.startDate : effectiveStartDate
        const requestData = {
          type: scheduleType,
          effective_start_date: effectiveStartDateForApi, // YYYY-MM-DD
          valid_until: validUntil, // Новый контракт API
          validUntil: validUntil // Дата уже в формате YYYY-MM-DD
        }

        if (scheduleType === 'weekdays') {
          requestData.weekdays = weekdays
        } else if (scheduleType === 'monthdays') {
          requestData.monthdays = monthdays
        } else if (scheduleType === 'shift') {
          requestData.shiftConfig = shiftConfig
        }


        const result = await apiPost('/api/master/schedule/rules', requestData)
        
        // Сохраняем данные о созданном расписании
        const scheduleData = {
          type: scheduleType,
          effectiveStartDate: effectiveStartDateForApi,
          validUntil: validUntil,
          data: scheduleType === 'weekdays' ? weekdays : 
                scheduleType === 'monthdays' ? monthdays : 
                shiftConfig,
          slotsCreated: result.slots_created,
          createdAt: new Date().toLocaleString('ru-RU')
        }
        
        setLastCreatedSchedule(scheduleData)
        localStorage.setItem('lastCreatedSchedule', JSON.stringify(scheduleData))
        
        // Обрабатываем конфликты
        if (result.conflicts && result.conflicts.length > 0) {
          setConflicts(result.conflicts)
          setShowConflictsModal(true)
        } else {
          // Показываем уведомление об успехе только если нет конфликтов
          alert(`Расписание успешно создано! Создано слотов: ${result.slots_created}`)
        }
        
        // Расписание будет перезагружено автоматически через useEffect в родительском компоненте
        
        // Закрываем модальное окно
        setShowCreateModal(false)
        
      } catch (error) {
        console.error('Ошибка при создании расписания:', error)
        alert(`Ошибка: ${error.message}`)
      }
    }

    if (!showCreateModal) return null

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
        <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4" onClick={e => e.stopPropagation()}>
          <h2 className="text-xl font-bold mb-4">Создать расписание</h2>
          
          {/* Предупреждение о перезаписи */}
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Внимание!</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  Создание нового расписания удалит существующее расписание в указанном периоде. 
                  Слоты с записями клиентов будут сохранены и отмечены как конфликты.
                </p>
              </div>
            </div>
          </div>
          
          {/* Выбор типа расписания */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-3">Тип расписания:</label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="scheduleType"
                  value="weekdays"
                  checked={scheduleType === 'weekdays'}
                  onChange={(e) => setScheduleType(e.target.value)}
                  className="mr-2 h-4 w-4 accent-[#4CAF50] focus:ring-[#4CAF50]"
                />
                Дни недели
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="scheduleType"
                  value="monthdays"
                  checked={scheduleType === 'monthdays'}
                  onChange={(e) => setScheduleType(e.target.value)}
                  className="mr-2 h-4 w-4 accent-[#4CAF50] focus:ring-[#4CAF50]"
                />
                Числа месяца
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="scheduleType"
                  value="shift"
                  checked={scheduleType === 'shift'}
                  onChange={(e) => setScheduleType(e.target.value)}
                  className="mr-2 h-4 w-4 accent-[#4CAF50] focus:ring-[#4CAF50]"
                />
                Сменный график
              </label>
            </div>
            {errors.scheduleType && <p className="text-red-500 text-sm mt-1">{errors.scheduleType}</p>}
          </div>

          {/* Дата начала действия (для weekdays/monthdays) */}
          {scheduleType && scheduleType !== 'shift' && (
            <div className="mb-6">
              <label className="block text-sm font-medium mb-1">Дата начала действия расписания:</label>
              <input
                type="date"
                value={effectiveStartDate}
                onChange={(e) => setEffectiveStartDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full border rounded px-3 py-2"
              />
              {errors.effectiveStartDate && <p className="text-red-500 text-sm mt-1">{errors.effectiveStartDate}</p>}
            </div>
          )}

          {/* Дни недели */}
          {scheduleType === 'weekdays' && (
            <div className="mb-6">
              <label className="block text-sm font-medium mb-3">Выберите рабочие дни:</label>
              <div className="space-y-3">
                {weekDays.map(day => (
                  <div key={day.id} className="flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={!!weekdays[day.id]}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setWeekdays(prev => ({
                              ...prev,
                              [day.id]: { start: '09:00', end: '18:00' }
                            }))
                          } else {
                            setWeekdays(prev => {
                              const newDays = { ...prev }
                              delete newDays[day.id]
                              return newDays
                            })
                          }
                        }}
                        className="mr-2 h-4 w-4 accent-[#4CAF50] focus:ring-[#4CAF50]"
                      />
                      {day.name}
                    </label>
                    {weekdays[day.id] && (
                      <div className="flex items-center space-x-2">
                        <input
                          type="time"
                          value={weekdays[day.id].start}
                          onChange={(e) => handleWeekdayChange(day.id, 'start', e.target.value)}
                          className="border rounded px-2 py-1"
                        />
                        <span>до</span>
                        <input
                          type="time"
                          value={weekdays[day.id].end}
                          onChange={(e) => handleWeekdayChange(day.id, 'end', e.target.value)}
                          className="border rounded px-2 py-1"
                        />
                        {errors[`weekday_${day.id}`] && (
                          <span className="text-red-500 text-sm">{errors[`weekday_${day.id}`]}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {errors.weekdays && <p className="text-red-500 text-sm mt-1">{errors.weekdays}</p>}
            </div>
          )}

          {/* Числа месяца */}
          {scheduleType === 'monthdays' && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium">Выберите числа месяца:</label>
                <button
                  onClick={addMonthday}
                  className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Добавить число
                </button>
              </div>
              <div className="space-y-3">
                {Object.entries(monthdays).map(([day, times]) => (
                  <div key={day} className="flex items-center space-x-4">
                    <span className="w-8">{day} число</span>
                    <input
                      type="time"
                      value={times.start}
                      onChange={(e) => handleMonthdayChange(day, 'start', e.target.value)}
                      className="border rounded px-2 py-1"
                    />
                    <span>до</span>
                    <input
                      type="time"
                      value={times.end}
                      onChange={(e) => handleMonthdayChange(day, 'end', e.target.value)}
                      className="border rounded px-2 py-1"
                    />
                    <button
                      onClick={() => removeMonthday(day)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Удалить
                    </button>
                    {errors[`monthday_${day}`] && (
                      <span className="text-red-500 text-sm">{errors[`monthday_${day}`]}</span>
                    )}
                  </div>
                ))}
              </div>
              {errors.monthdays && <p className="text-red-500 text-sm mt-1">{errors.monthdays}</p>}
            </div>
          )}

          {/* Сменный график */}
          {scheduleType === 'shift' && (
            <div className="mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Рабочих дней подряд:</label>
                  <input
                    type="number"
                    min="1"
                    value={shiftConfig.workDays}
                    onChange={(e) => setShiftConfig(prev => ({ ...prev, workDays: parseInt(e.target.value) || 0 }))}
                    className="w-full border rounded px-3 py-2"
                  />
                  {errors.workDays && <p className="text-red-500 text-sm mt-1">{errors.workDays}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Нерабочих дней подряд:</label>
                  <input
                    type="number"
                    min="0"
                    value={shiftConfig.restDays}
                    onChange={(e) => setShiftConfig(prev => ({ ...prev, restDays: parseInt(e.target.value) || 0 }))}
                    className="w-full border rounded px-3 py-2"
                  />
                  {errors.restDays && <p className="text-red-500 text-sm mt-1">{errors.restDays}</p>}
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">Дата первого рабочего дня:</label>
                <input
                  type="date"
                  value={shiftConfig.startDate}
                  onChange={(e) => setShiftConfig(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full border rounded px-3 py-2"
                />
                {errors.startDate && <p className="text-red-500 text-sm mt-1">{errors.startDate}</p>}
              </div>
            </div>
          )}

          {/* Дата окончания действия */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-1">Расписание действует до:</label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border rounded px-3 py-2"
            />
            {errors.validUntil && <p className="text-red-500 text-sm mt-1">{errors.validUntil}</p>}
          </div>

          {/* Кнопки */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              onClick={applySchedule}
              className="px-4 py-2 text-white rounded transition-colors"
              style={{ backgroundColor: '#4CAF50' }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#45a049'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#4CAF50'}
            >
              Создать расписание
            </button>
          </div>
        </div>
      </div>
    )
  }

  const ViewScheduleModal = () => {
    if (!showViewModal) return null

    // Используем данные из API, если они есть, иначе из localStorage
    const scheduleData = scheduleRules || lastCreatedSchedule
    if (!scheduleData) return null

    const formatScheduleData = () => {
      // Если данные из API, используем fixed_schedule
      if (scheduleRules) {
        const { fixed_schedule, created_at, updated_at } = scheduleRules
        const weekDays = [
          { id: 1, name: 'Понедельник' },
          { id: 2, name: 'Вторник' },
          { id: 3, name: 'Среда' },
          { id: 4, name: 'Четверг' },
          { id: 5, name: 'Пятница' },
          { id: 6, name: 'Суббота' },
          { id: 7, name: 'Воскресенье' }
        ]
        
        if (fixed_schedule.schedule_type === 'weekdays') {
          return (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">Дни недели</h3>
              <div className="space-y-2">
                {Object.entries(fixed_schedule.weekdays).map(([dayId, times]) => {
                  const dayName = weekDays.find(d => d.id === parseInt(dayId))?.name || `День ${dayId}`
                  const isEnabled = times.enabled
                  return (
                    <div key={dayId} className={`flex items-center justify-between p-3 rounded ${
                      isEnabled ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                    }`}>
                      <span className={`font-medium ${isEnabled ? 'text-green-800' : 'text-gray-500'}`}>
                        {dayName}
                      </span>
                      <span className={`text-sm ${isEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                        {isEnabled ? `${times.open} - ${times.close}` : 'Отключено'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        }
      }
      
      // Если данные из localStorage (старый формат)
      const { type, data, validUntil, slotsCreated, createdAt } = scheduleData
      
      if (type === 'weekdays') {
        const weekDays = [
          { id: 1, name: 'Понедельник' },
          { id: 2, name: 'Вторник' },
          { id: 3, name: 'Среда' },
          { id: 4, name: 'Четверг' },
          { id: 5, name: 'Пятница' },
          { id: 6, name: 'Суббота' },
          { id: 7, name: 'Воскресенье' }
        ]
        
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Дни недели</h3>
            <div className="space-y-2">
              {Object.entries(data).map(([dayId, times]) => {
                const dayName = weekDays.find(d => d.id === parseInt(dayId))?.name || `День ${dayId}`
                return (
                  <div key={dayId} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span className="font-medium">{dayName}</span>
                    <span className="text-sm text-gray-600">{times.start} - {times.end}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      } else if (type === 'monthdays') {
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Числа месяца</h3>
            <div className="space-y-2">
              {Object.entries(data).map(([day, times]) => (
                <div key={day} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="font-medium">{day} число</span>
                  <span className="text-sm text-gray-600">{times.start} - {times.end}</span>
                </div>
              ))}
            </div>
          </div>
        )
      } else if (type === 'shift') {
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Сменный график</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span className="font-medium">Рабочих дней</span>
                <span className="text-sm text-gray-600">{data.workDays}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span className="font-medium">Нерабочих дней</span>
                <span className="text-sm text-gray-600">{data.restDays}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span className="font-medium">Дата начала</span>
                <span className="text-sm text-gray-600">{data.startDate}</span>
              </div>
            </div>
          </div>
        )
      }
    }

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowViewModal(false)}>
        <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4" onClick={e => e.stopPropagation()}>
          <h2 className="text-xl font-bold mb-4">
            {scheduleRules ? 'Текущие настройки расписания' : 'Последнее созданное расписание'}
          </h2>
          
          {formatScheduleData()}
          
          <div className="mt-6 space-y-3">
            {scheduleRules ? (
              <>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="font-medium text-gray-800">Дата создания</span>
                  <span className="text-sm text-gray-600">
                    {new Date(scheduleRules.created_at).toLocaleDateString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="font-medium text-gray-800">Последнее обновление</span>
                  <span className="text-sm text-gray-600">
                    {new Date(scheduleRules.updated_at).toLocaleDateString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded">
                  <span className="font-medium text-blue-800">Действует до</span>
                  <span className="text-sm text-blue-600">
                    {(() => {
                      // Конвертируем дату из YYYY-MM-DD в DD-MM-YYYY для отображения
                      const date = new Date(lastCreatedSchedule.validUntil)
                      const day = date.getDate().toString().padStart(2, '0')
                      const month = (date.getMonth() + 1).toString().padStart(2, '0')
                      const year = date.getFullYear()
                      return `${day}-${month}-${year}`
                    })()}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 rounded">
                  <span className="font-medium text-green-800">Создано слотов</span>
                  <span className="text-sm text-green-600">{lastCreatedSchedule.slotsCreated}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="font-medium text-gray-800">Дата создания</span>
                  <span className="text-sm text-gray-600">{lastCreatedSchedule.createdAt}</span>
                </div>
              </>
            )}
          </div>
          
          <div className="flex justify-between mt-6">
            <button
              onClick={async () => {
                if (confirm('Вы уверены, что хотите удалить все будущее расписание? Это действие нельзя отменить.')) {
                  try {
                    const token = localStorage.getItem('access_token')
                    if (!token) {
                      alert('Ошибка авторизации')
                      return
                    }

                    const result = await apiDelete('/api/master/schedule/future')
                    alert(`Расписание успешно удалено. Удалено слотов: ${result.deleted_slots}`)
                    
                    // Очищаем локальное хранилище и закрываем модальное окно
                    localStorage.removeItem('lastCreatedSchedule')
                    setLastCreatedSchedule(null)
                    setShowViewModal(false)
                    
                    // Перезагружаем расписание
                    if (onChange) {
                      onChange({})
                    }
                  } catch (error) {
                    console.error('Ошибка при удалении расписания:', error)
                    alert('Ошибка при удалении расписания')
                  }
                }
              }}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              Удалить расписание
            </button>
            <button
              onClick={() => setShowViewModal(false)}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    )
  }


  const MonthlyCalendarModal = () => {
    if (!showMonthlyView) return null

    const monthName = getMonthName(currentMonth)

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowMonthlyView(false)}>
        <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Обзор месяца</h2>
            <button
              type="button"
              onClick={() => setShowMonthlyView(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-between mb-4">
            <button type="button" onClick={goToPreviousMonth} className="p-2 rounded hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="text-xl font-semibold">{monthName}</h3>
            <button type="button" onClick={goToNextMonth} className="p-2 rounded hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <MonthOverviewCalendar
            currentMonth={currentMonth}
            monthlySchedule={monthlySchedule}
            loading={monthlyScheduleLoading}
            layout="modal"
            showLegend
            onDayClick={navigateToWeekForDate}
          />
        </div>
      </div>
    )
  }

  const todayRef = new Date()

  return (
    <div
      className={`mx-auto max-w-full overflow-x-hidden rounded-lg border bg-white px-2 lg:max-w-8xl lg:overflow-hidden lg:px-4 ${
        !isLg && selected.size > 0 && !showMonthlyView ? 'pb-[max(5.5rem,env(safe-area-inset-bottom,0px))]' : ''
      }`}
    >
      {allConflicts.length > 0 ? (
        <div
          className="-mx-2 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 lg:hidden"
          role="status"
        >
          <span className="font-medium">Конфликты расписания: {allConflicts.length}</span>
          <span className="text-red-700"> — см. блок ниже, действия без hover.</span>
        </div>
      ) : null}
      {/* Верхняя строка: заголовок и кнопки навигации */}
      <div className="-mx-2 flex min-h-[40px] items-center justify-between border-b bg-gray-50 px-2 py-1.5 lg:mx-0 lg:min-h-0 lg:px-6 lg:py-2">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0 sm:max-w-[55%] lg:max-w-none lg:flex-row lg:items-center lg:gap-4">
          <div className="truncate text-sm font-semibold lg:text-base">
            {showMonthlyView ? 'Расписание на месяц' : 'Расписание на неделю'}
          </div>
          {!showMonthlyView && weekDates.length >= 7 ? (
            <span className="max-w-full truncate text-[10px] font-normal leading-tight text-gray-500 lg:text-xs">
              {weekDates[0].date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} —{' '}
              {weekDates[6].date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1 lg:gap-2">
          {showMonthlyView ? (
            <>
              <button
                onClick={goToPreviousMonth}
                className="p-1 rounded hover:bg-gray-200 transition-colors"
                title="Предыдущий месяц"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="px-3 py-1 text-sm font-medium">
                {currentMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
              </div>
              <button
                onClick={goToNextMonth}
                className="p-1 rounded hover:bg-gray-200 transition-colors"
                title="Следующий месяц"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={goToPreviousWeek}
                className="inline-flex min-h-8 min-w-8 items-center justify-center rounded p-1 transition-colors hover:bg-gray-200 lg:min-h-0 lg:min-w-0"
                title="Предыдущая неделя"
                aria-label="Предыдущая неделя"
              >
                <svg className="h-4 w-4 lg:h-4 lg:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={goToCurrentWeek}
                className="min-h-8 rounded bg-gray-200 px-2 py-1 text-[11px] transition-colors hover:bg-gray-300 lg:min-h-0 lg:px-2 lg:py-1 lg:text-xs"
                title="Текущая неделя"
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={goToNextWeek}
                className="inline-flex min-h-8 min-w-8 items-center justify-center rounded p-1 transition-colors hover:bg-gray-200 lg:min-h-0 lg:min-w-0"
                title="Следующая неделя"
                aria-label="Следующая неделя"
              >
                <svg className="h-4 w-4 lg:h-4 lg:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Вторая строка: кнопки управления расписанием (на <lg — заметно компактнее) */}
      <div className="-mx-2 flex flex-col gap-1 border-b bg-gray-50 px-2 py-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between lg:mx-0 lg:gap-2 lg:px-6 lg:py-2">
        <div className="flex flex-wrap items-center gap-1 lg:gap-2">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="min-h-[26px] rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white transition-colors lg:min-h-0 lg:rounded lg:px-3 lg:py-2 lg:text-sm"
            style={{ backgroundColor: '#4CAF50' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#45a049'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#4CAF50'}
            title="Создать расписание"
          >
            Создать расписание
          </button>
          <button
            type="button"
            onClick={() => setShowViewModal(true)}
            className="min-h-[26px] rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white transition-colors disabled:opacity-50 lg:min-h-0 lg:rounded lg:px-3 lg:py-2 lg:text-sm"
            style={{ backgroundColor: '#2196F3' }}
            onMouseEnter={(e) => !e.target.disabled && (e.target.style.backgroundColor = '#1976D2')}
            onMouseLeave={(e) => !e.target.disabled && (e.target.style.backgroundColor = '#2196F3')}
            disabled={!lastCreatedSchedule}
            title="Посмотреть расписание"
          >
            Посмотреть расписание
          </button>
          <button
            type="button"
            onClick={() => setShowMonthlyView(true)}
            className="min-h-[26px] rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight text-white transition-colors lg:min-h-0 lg:rounded lg:px-3 lg:py-2 lg:text-sm"
            style={{ backgroundColor: '#FF9800' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#F57C00'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#FF9800'}
            title="Обзор месяца"
          >
            Обзор месяца
          </button>
        </div>
        <div className="hidden flex-wrap gap-2 lg:flex">
          <button
            className="rounded px-3 py-2 text-sm text-white transition-colors disabled:opacity-50 lg:min-h-0 lg:py-1"
            style={{ backgroundColor: '#4CAF50' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#45a049'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#4CAF50'}
            onClick={() => handleSetWorking(true)}
            disabled={selected.size === 0 || saving}
          >
            {saving ? 'Сохранение...' : 'Установить рабочее время'}
          </button>
          <button
            className="rounded bg-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-400 disabled:opacity-50 lg:min-h-0 lg:py-1"
            onClick={() => handleSetWorking(false)}
            disabled={selected.size === 0 || saving}
          >
            {saving ? 'Сохранение...' : 'Установить нерабочее время'}
          </button>
        </div>
      </div>
      <div
        className={`relative max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] lg:max-h-[600px] lg:overflow-auto ${isLg ? 'touch-pan-x' : 'touch-auto'}`}
        ref={tableRef}
        onMouseUp={handleMouseUp}
        onPointerUp={handleMouseUp}
        onPointerCancel={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onMouseMove={handleTableMouseMove}
      >
        {/* Индикаторы прокрутки */}
        {showScrollIndicator.top && (
          <div className="scroll-indicator top"></div>
        )}
        {showScrollIndicator.bottom && (
          <div className="scroll-indicator bottom"></div>
        )}
        {showMonthlyView ? (
          <MonthOverviewCalendar
            currentMonth={currentMonth}
            monthlySchedule={monthlySchedule}
            loading={monthlyScheduleLoading}
            layout="embedded"
            showLegend
            onDayClick={navigateToWeekForDate}
          />
        ) : (
          <table id="schedule-table" className="w-full select-none" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
            <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
              <tr>
                <th className="w-16"></th>
                {weekDates.map(day => {
                  const isTodayCol = isSameCalendarDay(day.date, todayRef)
                  return (
                  <th
                    key={day.date.toISOString().split('T')[0]}
                    className={`text-center px-2 py-1 text-sm font-semibold text-gray-700 ${isTodayCol ? 'bg-green-50 ring-1 ring-inset ring-green-500/40' : ''}`}
                    style={{ transition: 'background-color 0.2s', width: '160px' }}
                  >
                    <div
                      className="flex flex-col items-center gap-0.5"
                      onPointerDown={!isLg ? handleDayHeaderPointerDownMobile(day) : undefined}
                      onPointerUp={!isLg ? handleDayHeaderPointerUpMobile : undefined}
                      onPointerCancel={!isLg ? handleDayHeaderPointerUpMobile : undefined}
                      onPointerLeave={!isLg ? handleDayHeaderPointerUpMobile : undefined}
                    >
                      {isTodayCol ? (
                        <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wide text-green-700 lg:hidden">
                          Сегодня
                        </span>
                      ) : null}
                      {isLg ? (
                        <button
                          type="button"
                          className="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-green-700 hover:bg-green-50"
                          title="Настроить день"
                          aria-label="Настроить день"
                          onClick={(e) => {
                            e.stopPropagation()
                            openDayDrawerMenu(day)
                          }}
                        >
                          <AdjustmentsHorizontalIcon className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      ) : null}
                      <span
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer touch-manipulation text-[11px] font-semibold leading-tight hover:text-green-800 lg:text-sm"
                        title={!isLg ? 'Нажмите — выделить день; удерживайте — настройки дня' : undefined}
                        onMouseEnter={(e) => { e.currentTarget.closest('th').style.backgroundColor = '#DFF5EC' }}
                        onMouseLeave={(e) => { e.currentTarget.closest('th').style.backgroundColor = '' }}
                        onClick={handleDayLabelClick(day.date.toISOString().split('T')[0])}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleDayLabelClick(day.date.toISOString().split('T')[0])(e)
                          }
                        }}
                      >
                        {day.label}
                      </span>
                    </div>
                  </th>
                )})}
              </tr>
            </thead>
            <tbody>
              {HOURS.flatMap(hour => MINUTES.map(minute => (
                <tr key={hour + ':' + minute} style={{ height: 24 }}>
                  <td
                    className="text-xs text-gray-500 text-right pr-2 cursor-pointer"
                    style={{ transition: 'background-color 0.2s', width: '80px' }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#DFF5EC'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = ''}
                    onClick={() => handleTimeHeaderClick(hour, minute)}
                  >
                    {getTimeLabel(hour, minute)}
                  </td>
                  {weekDates.map((day, dayIndex) => {
                    const slotKey = getSlotKey(day.date, hour, minute)
                    const slotData = schedule?.[slotKey]
                    const isActive = slotData?.is_working || false
                    const workType = slotData?.work_type
                    const hasConflict = slotData?.has_conflict || false
                    const isFrozen = slotData?.is_frozen || false
                    const isSelected = selected.has(slotKey)
                    const timeIndex = hour * 6 + (minute / 10)
                    const slotBookings = getBookingsForSlot(day.date, hour, minute)
                    
                    // Определяем цвет ячейки
                    let cellClass = 'h-6 cursor-pointer transition-colors border border-gray-200 relative '
                    if (isSelected) {
                      cellClass += 'selected-slot'
                    } else if (isFrozen) {
                      cellClass += 'bg-cyan-100 hover:bg-cyan-200' // Замороженный день - светло-голубой
                    } else if (isActive) {
                      if (hasConflict) {
                        cellClass += 'bg-red-100 hover:bg-red-200' // Конфликт - красный
                      } else if (workType === 'salon') {
                        cellClass += 'bg-blue-100 hover:bg-blue-200' // Работа в салоне - синий
                      } else {
                        cellClass += 'bg-green-100 hover:bg-green-200' // Личное расписание - зеленый
                      }
                    } else {
                      cellClass += 'bg-gray-100 hover:bg-gray-200'
                    }
                    
                    return (
                      <td
                        key={slotKey}
                        className={cellClass}
                        style={{ width: '160px' }}
                        title={isFrozen ? 'Тариф заморожен' : ''}
                        onMouseDown={isLg ? handleSlotMouseDown(slotKey, isActive, dayIndex, timeIndex) : undefined}
                        onClick={!isLg ? handleSlotTapMobile(slotKey) : undefined}
                        onMouseEnter={handleSlotMouseEnter(slotKey)}
                        onMouseMove={handleSlotMouseMove(slotKey, dayIndex, timeIndex)}
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
                              role="button"
                              tabIndex={0}
                              className="absolute left-0 right-0 z-[1] min-h-[36px] cursor-pointer overflow-hidden rounded border border-blue-300 bg-white p-1 text-xs shadow-sm transition-shadow [touch-action:manipulation] active:opacity-90 lg:min-h-0 lg:hover:shadow-md"
                              style={{
                                top: '1px',
                                height: `${isLg ? height : Math.max(height, 36)}px`,
                                fontSize: '10px',
                                lineHeight: '1.2'
                              }}
                              onPointerDown={(e) => {
                                e.stopPropagation()
                              }}
                              onTouchStart={(e) => {
                                e.stopPropagation()
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (!isLg) {
                                  openMobileBookingDetail(booking)
                                }
                              }}
                              onKeyDown={(e) => {
                                if (!isLg && (e.key === 'Enter' || e.key === ' ')) {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  openMobileBookingDetail(booking)
                                }
                              }}
                              {...(isLg
                                ? {
                                    onMouseEnter: (e) => handleBookingMouseEnter(booking, e),
                                    onMouseLeave: handleBookingMouseLeave,
                                  }
                                : {})}
                            >
                              <div className="font-medium text-blue-800 truncate flex items-center gap-1">
                                {(booking.client_display_name || booking.client_name) || 'Клиент'}
                                {booking.client_phone && <span className="text-xs text-gray-500 font-normal">({booking.client_phone})</span>}
                                {booking.has_client_note ? (
                                  <span title={booking.client_note || ''} className="text-gray-900 cursor-help flex-shrink-0 no-underline">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-blue-600 truncate">
                                {booking.service_name}
                              </div>
                              <div className="text-gray-500 text-xs">
                                {startTime.toTimeString().slice(0, 5)}-{endTime.toTimeString().slice(0, 5)}
                              </div>
                              {booking.service_price != null && booking.service_price !== '' && !Number.isNaN(Number(booking.service_price)) ? (
                                <div className="text-green-700 font-semibold text-[10px] mt-0.5">
                                  {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0 }).format(Number(booking.service_price))}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </td>
                    )
                  })}
                </tr>
              )))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Легенда цветографики */}
      <div className="-mx-2 flex flex-col gap-3 border-t bg-gray-50 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between lg:mx-0 lg:px-6">
        <div className="flex flex-col gap-2 sm:flex-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <h4 className="shrink-0 text-sm font-medium text-gray-700">Легенда расписания:</h4>
          <div className="flex flex-wrap items-center gap-3 text-xs sm:gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border border-gray-200 rounded"></div>
              <span className="text-gray-600">Личное расписание</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-100 border border-gray-200 rounded"></div>
              <span className="text-gray-600">Работа в салоне</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-100 border border-gray-200 rounded"></div>
              <span className="text-gray-600">Конфликт расписания</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-100 border border-gray-200 rounded"></div>
              <span className="text-gray-600">Нерабочее время</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-cyan-100 border border-gray-200 rounded"></div>
              <span className="text-gray-600">Тариф заморожен</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#DFF5EC', border: '1px solid #4CAF50' }}></div>
              <span className="text-gray-600">Выделено для изменения</span>
            </div>
          </div>
        </div>
        <div className="hidden text-xs text-gray-400 lg:block">
          * Для массового выделения используйте drag&drop или клики по заголовкам дней/времени
        </div>
      </div>

      {/* Список конфликтов расписания */}
      <div className="-mx-2 border-t bg-gray-50 px-3 py-4 lg:mx-0 lg:px-6">
        <div className="mb-3">
          <h4 className="text-sm font-medium text-gray-700">Конфликты расписания</h4>
          <p className="text-xs text-gray-500 mt-1">
            {allConflicts.length > 0 
              ? `Найдено ${allConflicts.length} конфликт${allConflicts.length === 1 ? '' : allConflicts.length < 5 ? 'а' : 'ов'} на ближайшие 12 недель`
              : 'Конфликтов не найдено'
            }
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          {(() => {
            // Показываем ВСЕ конфликты из allConflicts (уже загружены на 12 недель вперед)
            // Группируем конфликты по датам
            const conflictsByDate = {}
            allConflicts.forEach(conflict => {
              if (!conflictsByDate[conflict.date]) {
                conflictsByDate[conflict.date] = []
              }
              conflictsByDate[conflict.date].push(conflict)
            })
            
            if (Object.keys(conflictsByDate).length > 0) {
              return (
                <div className="space-y-3">
                  {Object.entries(conflictsByDate).map(([date, conflicts]) => {
                    const conflictDate = new Date(date)
                    const hasPersonalWork = conflicts.some(conflict => conflict.work_type === 'personal')
                    const hasSalonWork = conflicts.some(conflict => conflict.work_type === 'salon')
                    
                    return (
                      <div key={date} className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start space-x-3 sm:items-center">
                          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500 sm:mt-0"></div>
                          <div className="min-w-0">
                            <h5 className="text-sm font-medium text-gray-800">
                              {conflictDate.toLocaleDateString('ru-RU', { 
                                weekday: 'long', 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                              })}
                            </h5>
                            <p className="text-xs text-red-600">
                              {hasPersonalWork && hasSalonWork 
                                ? 'Конфликт между личным расписанием и работой в салоне'
                                : hasPersonalWork 
                                  ? 'Личное расписание конфликтует с работой в салоне'
                                  : 'Работа в салоне конфликтует с личным расписанием'
                              }
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                          <button
                            type="button"
                            onClick={() => handleGoToDate(conflictDate)}
                            className="group relative flex min-h-10 min-w-[4.5rem] items-center justify-center gap-1 rounded-lg px-2 text-gray-600 transition-colors hover:bg-blue-100 hover:text-blue-600"
                            title="Перейти к дню - переключиться на недельный вид и показать выбранную дату"
                            aria-label="Перейти к дню"
                          >
                            <CalendarDaysIcon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            <span className="text-xs font-medium lg:hidden">К дню</span>
                            <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-75 lg:block lg:opacity-0 lg:group-hover:opacity-100">
                              Перейти к дню
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleResolveConflict(`${date}_${conflicts[0].start_time.replace(':', '_')}`, 'remove')}
                            className="group relative flex min-h-10 min-w-[4.5rem] items-center justify-center gap-1 rounded-lg px-2 text-gray-600 transition-colors hover:bg-red-100 hover:text-red-600"
                            title="Удалить конфликт в собственном расписании - пометить личный календарь в этот день как нерабочий"
                            aria-label="Удалить конфликт"
                          >
                            <TrashIcon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            <span className="text-xs font-medium lg:hidden">Убрать</span>
                            <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-75 lg:block lg:opacity-0 lg:group-hover:opacity-100">
                              Удалить конфликт
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleIgnoreConflict(date)}
                            className="group relative flex min-h-10 min-w-[4.5rem] items-center justify-center gap-1 rounded-lg px-2 text-gray-600 transition-colors hover:bg-yellow-100 hover:text-yellow-700"
                            title="Игнорировать - перестать обращать внимание на этот конфликт"
                            aria-label="Игнорировать конфликт"
                          >
                            <EyeSlashIcon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                            <span className="text-xs font-medium lg:hidden">Игнор.</span>
                            <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-75 lg:block lg:opacity-0 lg:group-hover:opacity-100">
                              Игнорировать
                            </div>
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            } else {
              return (
                <div className="text-center py-8 text-gray-500">
                  <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm">Конфликтов расписания не найдено</p>
                  <p className="text-xs text-gray-400 mt-1">Здесь будут отображаться конфликты при пересечении личного расписания с работой в салоне</p>
                </div>
              )
            }
          })()}
        </div>
      </div>
      
      {/* Модальное окно создания расписания */}
      <CreateScheduleModal />
      
      {/* Модальное окно просмотра расписания */}
      <ViewScheduleModal />
      
      {/* Модальное окно конфликтов */}
      <ConflictsList 
        conflicts={allConflicts}
        isOpen={showConflictsModal}
        onClose={() => setShowConflictsModal(false)}
      />
      
      {/* Модальное окно месячного календаря */}
      <MonthlyCalendarModal />
      
      <MasterDayDrawerModal
        isOpen={dayDrawerOpen}
        onClose={() => setDayDrawerOpen(false)}
        dateStr={dayDrawerDateStr}
        slotsForDay={dayDrawerSlots}
        bookings={bookings}
        onSaved={() => {
          loadBookings()
          if (typeof onDayScheduleSaved === 'function') onDayScheduleSaved()
        }}
      />

      {/* Поп-ап с информацией о записи */}
      <PopupCard
        booking={popupBooking}
        position={popupPosition}
        visible={popupVisible && isLg}
        onClose={handlePopupClose}
        onCancelSuccess={loadBookings}
        onConfirmSuccess={loadBookings}
        masterSettings={masterSettings}
        onMouseEnter={handlePopupMouseEnter}
        onMouseLeave={handlePopupMouseLeave}
      />

      {/* Mobile: см. MASTER_OVERLAY_Z — выше sticky-хрома календаря; desktop PopupCard */}
      {/* Mobile web: рабочее / нерабочее время — внизу, только при выделении слотов (не перегружает экран). */}
      {!isLg && !showMonthlyView && selected.size > 0 ? (
        <div
          className="fixed inset-x-0 z-[45] flex gap-2 border-t border-gray-200 bg-white/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur-sm lg:hidden bottom-[max(4.25rem,calc(3.5rem+env(safe-area-inset-bottom,0px)))]"
          role="toolbar"
          aria-label="Рабочее время выделенных слотов"
        >
          <button
            type="button"
            className="min-h-10 flex-1 rounded px-2 text-xs font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#4CAF50' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#45a049'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#4CAF50'}
            onClick={() => handleSetWorking(true)}
            disabled={saving}
          >
            {saving ? 'Сохранение…' : 'Рабочее время'}
          </button>
          <button
            type="button"
            className="min-h-10 flex-1 rounded bg-gray-200 px-2 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-300 disabled:opacity-50"
            onClick={() => handleSetWorking(false)}
            disabled={saving}
          >
            {saving ? 'Сохранение…' : 'Нерабочее время'}
          </button>
        </div>
      ) : null}

      <div className="lg:hidden">
        <MasterBookingDetailSheet
          isOpen={!!mobileDetailBooking}
          booking={mobileDetailBooking}
          onClose={() => setMobileDetailBooking(null)}
          sectionType={
            mobileDetailBooking ? scheduleSectionTypeForBooking(mobileDetailBooking) : 'future'
          }
          master={masterSettings?.master ?? null}
          hasExtendedStats={hasExtendedStats}
          hideActions={
            !!(
              mobileDetailBooking &&
              scheduleSectionTypeForBooking(mobileDetailBooking) === 'future' &&
              isFutureCancelled(mobileDetailBooking.status)
            )
          }
          actionBookingId={actionBookingId}
          onConfirm={handleMobileConfirm}
          onCancelRequest={(id) => setCancelBookingId(id)}
          zIndexClass={masterZClass('scheduleDetail')}
        />
        <MasterBookingCancelSheet
          isOpen={!!cancelBookingId}
          onClose={() => setCancelBookingId(null)}
          onSelectReason={(key) => handleMobileCancelWithReason(cancelBookingId, key)}
          zIndexClass={masterZClass('scheduleCancel')}
        />
      </div>
    </div>
  )
} 