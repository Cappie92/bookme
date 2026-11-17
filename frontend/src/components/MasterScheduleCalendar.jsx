import { formatLocalDate, localizeScheduleError } from '../utils/scheduleDates';
import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { CalendarDaysIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
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
import CalendarB3Composer from './master/CalendarB3Composer'
import { categoryLabel, clipStartsInSlot, dayClipMinutes, listCalendarBlocks, rememberVersion, wallClock, wallLabel } from '../utils/calendarB3'
import { manualCreateComposerState, useConsumeManualCreateIntent } from '../utils/masterManualCreateIntent'
import { syncMasterDaySelection } from '../utils/masterDaySelection'
import MasterScheduleDayCompact from './master/MasterScheduleDayCompact'
import MasterScheduleDayMobileSheet from './master/MasterScheduleDayMobileSheet'
import MasterScheduleWeekTimeline from './master/MasterScheduleWeekTimeline'
import MasterScheduleHeader from './master/MasterScheduleHeader'
import MasterScheduleTemplatePanel from './master/MasterScheduleTemplatePanel'
import { blockEventSource, bookingEventSource, gridEventSurface } from '../utils/dedatoCalendarEventTokens'
import {
  mcBtnPrimary,
  mcBtnSecondary,
  mcCard,
  mcFormTitle,
  mcWeekCanvas,
} from '../utils/masterCabinetUi'

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
  .selected-slot {
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
const TIMELINE_INITIAL_SCROLL_HOUR = 9

function getScrollTopForTimelineHour(hour) {
  return hour * SLOTS_PER_HOUR * TIMELINE_ROW_HEIGHT_PX
}

function getTimeLabel(hour, minute) {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
}

function getSlotKey(date, hour, minute) {
  return `${formatLocalDate(date)}_${hour}_${minute}`
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
  manualCreateIntentKey = 0,
  onManualCreateIntentConsumed = null,
  onOpenPastAppointments = null,
  scheduleSurfaceKey = 0,
}) {
  const { isIosRestrictedContext } = useAuth()
  // schedule: { [slotKey]: true/false } — true = рабочий, false = нерабочий
  const [selected, setSelected] = useState(new Set())
  const [dragging, setDragging] = useState(false)
  const [dragMode, setDragMode] = useState(null) // 'select' | 'deselect'
  const [saving, setSaving] = useState(false)
  const [dragStart, setDragStart] = useState(null) // { slotKey, dayIndex, timeIndex }
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [lastCreatedSchedule, setLastCreatedSchedule] = useState(null)
  const [showScrollIndicator, setShowScrollIndicator] = useState({ top: false, bottom: false })
  const [conflicts, setConflicts] = useState([])
  const [showConflictsModal, setShowConflictsModal] = useState(false)
  const [showMonthlyView, setShowMonthlyView] = useState(false)
  const [monthlySchedule, setMonthlySchedule] = useState({})
  const [monthlyScheduleLoading, setMonthlyScheduleLoading] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [scheduleRules, setScheduleRules] = useState(null)
  const [scheduleRulesLoading, setScheduleRulesLoading] = useState(true)
  const [scheduleRulesError, setScheduleRulesError] = useState('')
  const [bookings, setBookings] = useState([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingsError, setBookingsError] = useState('')
  const [blocks, setBlocks] = useState([])
  const [blocksError, setBlocksError] = useState('')
  const [composer, setComposer] = useState(null)
  const [calendarLayoutMode, setCalendarLayoutMode] = useState('week')
  const [focusDay, setFocusDay] = useState(() => new Date())
  const [daySelection, setDaySelection] = useState(null)
  const [dayCreatePrefill, setDayCreatePrefill] = useState(null)
  const dayCreatePrefillSeqRef = useRef(0)

  const goDayCreateManual = (prefill) => {
    dayCreatePrefillSeqRef.current += 1
    setCalendarLayoutMode('day')
    setDaySelection(null)
    setDayCreatePrefill(prefill
      ? { ...prefill, commandId: dayCreatePrefillSeqRef.current }
      : { commandId: dayCreatePrefillSeqRef.current })
    if (prefill?.dateStr) {
      const [y, m, d] = prefill.dateStr.split('-').map(Number)
      if (y && m && d) setFocusDay(new Date(y, m - 1, d))
    }
  }

  const openNewManualBooking = () => {
    if (isLg && calendarLayoutMode === 'day') {
      goDayCreateManual({ mode: 'manual' })
      return
    }
    setComposer(manualCreateComposerState(focusDay))
  }

  const openNewPersonalBlock = () => {
    if (isLg && calendarLayoutMode === 'day') {
      goDayCreateManual({ mode: 'block' })
      return
    }
    setComposer({
      mode: 'block',
      dateStr: formatLocalDate(focusDay),
      event: null,
    })
  }

  useEffect(() => {
    if (manualCreateIntentKey) return
    setCalendarLayoutMode('week')
    setDaySelection(null)
    setDayCreatePrefill(null)
    setShowMonthlyView(false)
  }, [scheduleSurfaceKey, manualCreateIntentKey])

  useConsumeManualCreateIntent({
    intentKey: manualCreateIntentKey,
    setComposer,
    onConsumed: onManualCreateIntentConsumed,
  })

  const closeComposer = () => {
    setComposer(null)
    if (manualCreateIntentKey) {
      onManualCreateIntentConsumed?.()
    }
  }
  const [popupVisible, setPopupVisible] = useState(false)
  const [popupBooking, setPopupBooking] = useState(null)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })
  const [dayDrawerOpen, setDayDrawerOpen] = useState(false)
  const [dayDrawerDateStr, setDayDrawerDateStr] = useState(null)
  const [dayDrawerSlots, setDayDrawerSlots] = useState([])
  const [dayDrawerPurpose, setDayDrawerPurpose] = useState('day-menu')

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
    setScheduleRulesLoading(true)
    setScheduleRulesError('')
    try {
      const data = await apiGet('/api/master/schedule/rules')
      setScheduleRules(data?.has_settings ? data : null)
    } catch (error) {
      console.error('Ошибка при загрузке правил расписания:', error)
      setScheduleRules(null)
      setScheduleRulesError('Не удалось загрузить правила расписания. Повторите позже.')
    } finally {
      setScheduleRulesLoading(false)
    }
  }

  // Загружаем записи мастера
  const loadBookings = async () => {
    setBookingsLoading(true)
    try {
      const data = await apiGet('/api/master/bookings/detailed')
      const rows = Array.isArray(data) ? data : []
      rows.forEach((row) => {
        if (row?.source === 'manual' && row.version) rememberVersion('booking', row.id, row.version)
      })
      setBookings(rows)
      setBookingsError('')
      return rows
    } catch (error) {
      console.error('Ошибка при загрузке записей:', error)
      setBookingsError('Не удалось загрузить записи')
      return []
    } finally {
      setBookingsLoading(false)
    }
  }

  const syncDaySelection = (rows, blockRows) => {
    setDaySelection((prev) => syncMasterDaySelection(prev, rows, blockRows))
  }

  const loadBlocks = async () => {
    try {
      const data = await listCalendarBlocks()
      const rows = Array.isArray(data) ? data : []
      rows.forEach((row) => {
        if (row?.id && row.version) rememberVersion('block', row.id, row.version)
      })
      const visible = rows.filter((row) => !row.deleted_at)
      setBlocks(visible)
      setBlocksError('')
      return visible
    } catch (error) {
      console.error('Ошибка при загрузке блоков:', error)
      setBlocksError('Не удалось загрузить личные блоки')
      return []
    }
  }

  // Загружаем правила при инициализации
  React.useEffect(() => {
    loadScheduleRules()
    loadBookings()
    loadBlocks()
  }, [])

  // Загружаем записи при изменении недели
  React.useEffect(() => {
    loadBookings()
    loadBlocks()
  }, [currentWeekOffset])

  useEffect(() => {
    setDaySelection(null)
  }, [formatLocalDate(focusDay)])

  useEffect(() => {
    syncDaySelection(bookings, blocks)
  }, [bookings, blocks])

  const tableRef = useRef(null)
  const dayHeaderLongPressTimerRef = useRef(null)
  const suppressNextDayLabelClickRef = useRef(false)
  const userAdjustedWeekScrollRef = useRef(false)

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
    const dateStr = formatLocalDate(date)
    return bookings.filter((booking) => clipStartsInSlot(dateStr, hour, minute, booking.start_time, booking.end_time))
  }

  const getBlocksForSlot = (date, hour, minute) => {
    const dateStr = formatLocalDate(date)
    return blocks.filter((block) => clipStartsInSlot(dateStr, hour, minute, block.start_time, block.end_time))
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
  const openManualComposer = (booking) => {
    setMobileDetailBooking(null)
    setCancelBookingId(null)
    setComposer({
      mode: 'manual',
      dateStr: wallClock(booking?.start_time)?.date || '',
      event: booking,
    })
  }

  const handleMobileConfirm = async (bookingId, booking) => {
    if (booking?.source === 'manual') {
      openManualComposer(booking)
      return
    }
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
      const rows = await loadBookings()
      syncDaySelection(rows, blocks)
      setMobileDetailBooking(null)
      setDaySelection(null)
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Ошибка при подтверждении записи', 'error')
    } finally {
      setActionBookingId(null)
    }
  }

  const handleMobileCancelWithReason = async (bookingId, reason) => {
    const booking = bookings.find((item) => item.id === bookingId) || mobileDetailBooking
    if (booking?.source === 'manual') {
      setCancelBookingId(null)
      openManualComposer(booking)
      return
    }
    setCancelBookingId(null)
    if (!reason) return
    try {
      setActionBookingId(bookingId)
      await apiPost(`/api/master/accounting/cancel-booking/${bookingId}?cancellation_reason=${reason}`)
      showToast('Запись отменена', 'success')
      const rows = await loadBookings()
      syncDaySelection(rows, blocks)
      setMobileDetailBooking(null)
      setDaySelection(null)
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
  const openDayDrawerMenu = (day, purpose = 'day-menu') => {
    const dateStr = formatLocalDate(day.date)
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
    setDayDrawerPurpose(purpose)
    setDayDrawerOpen(true)
  }

  const openSlotManagement = () => {
    openDayDrawerMenu({ date: focusDay, label: formatLocalDate(focusDay) }, 'slots')
  }

  const reloadCalendarEvents = async () => {
    const rows = await loadBookings()
    const blockRows = await loadBlocks()
    return { bookings: rows, blocks: blockRows }
  }

  const handleDayDetailSaved = async (saved) => {
    const { bookings: rows, blocks: blockRows } = await reloadCalendarEvents()
    if (saved?.id != null && daySelection) {
      if (daySelection.kind === 'booking') {
        const hit = rows.find((row) => row.id === saved.id)
        if (hit) setDaySelection({ kind: 'booking', data: hit })
        else setDaySelection(null)
      } else {
        const hit = blockRows.find((row) => row.id === saved.id)
        if (hit) setDaySelection({ kind: 'block', data: hit })
        else setDaySelection(null)
      }
      return
    }
    syncDaySelection(rows, blockRows)
  }

  const handleDayHeaderClick = (dayKey) => {
    const daySlots = slots.filter(s => formatLocalDate(s.date) === dayKey).map(s => getSlotKey(s.date, s.hour, s.minute))
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

  const applyWeekTimelineScroll = React.useCallback(() => {
    if (calendarLayoutMode !== 'week' || showMonthlyView) return
    scrollToTimelineInitialHour()
    window.setTimeout(scrollToTimelineInitialHour, 50)
    window.setTimeout(scrollToTimelineInitialHour, 200)
  }, [calendarLayoutMode, showMonthlyView, scrollToTimelineInitialHour])

  React.useEffect(() => {
    const wrap = tableRef.current
    if (!wrap || calendarLayoutMode !== 'week') return undefined
    const onScroll = () => {
      userAdjustedWeekScrollRef.current = true
    }
    wrap.addEventListener('scroll', onScroll, { passive: true })
    return () => wrap.removeEventListener('scroll', onScroll)
  }, [calendarLayoutMode, currentWeekOffset])

  /** Первый заход в неделю и возврат День → Неделя: прокрутка к TIMELINE_INITIAL_SCROLL_HOUR (08:00). */
  React.useEffect(() => {
    if (calendarLayoutMode !== 'week' || showMonthlyView) return undefined
    userAdjustedWeekScrollRef.current = false
    applyWeekTimelineScroll()
    return undefined
  }, [calendarLayoutMode, showMonthlyView, currentWeekOffset, applyWeekTimelineScroll])

  React.useEffect(() => {
    if (userAdjustedWeekScrollRef.current) return
    if (calendarLayoutMode !== 'week' || showMonthlyView || !schedule) return
    applyWeekTimelineScroll()
  }, [schedule, calendarLayoutMode, showMonthlyView, applyWeekTimelineScroll])

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

    useEffect(() => {
      if (!showCreateModal || !scheduleRules?.fixed_schedule) return
      const fixed = scheduleRules.fixed_schedule
      const type = fixed.type || fixed.schedule_type
      if (type === 'weekdays') {
        setScheduleType('weekdays')
        const src = fixed.weekdays || fixed.weekdayTimes || {}
        const next = {}
        Object.entries(src).forEach(([dayId, times]) => {
          if (times?.enabled === false) return
          const open = times.open || times.start
          const close = times.close || times.end
          if (open && close) next[dayId] = { start: open, end: close }
        })
        setWeekdays(next)
      } else if (type === 'monthdays' && fixed.monthdays) {
        setScheduleType('monthdays')
        const next = {}
        Object.entries(fixed.monthdays).forEach(([day, times]) => {
          if (times?.start && times?.end) next[day] = { start: times.start, end: times.end }
        })
        setMonthdays(next)
      } else if (type === 'shift' || type === 'shift_schedule') {
        setScheduleType('shift')
        const cfg = fixed.shiftConfig || fixed
        setShiftConfig({
          workDays: cfg.workDays ?? 2,
          restDays: cfg.restDays ?? 1,
          startDate: cfg.startDate || '',
        })
      }
      if (scheduleRules.valid_until) setValidUntil(scheduleRules.valid_until)
    }, [showCreateModal, scheduleRules])

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
        await loadScheduleRules()
        
      } catch (error) {
        console.error('Ошибка при создании расписания:', error)
        alert(`Ошибка: ${localizeScheduleError(error.message)}`)
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
                min={formatLocalDate(new Date())}
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
              min={formatLocalDate(new Date())}
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
      data-testid="master-schedule-surface"
      className={`mx-auto w-full min-w-0 max-w-[350px] lg:max-w-[1120px] ${
        !isLg && selected.size > 0 && !showMonthlyView ? 'pb-[max(5.5rem,env(safe-area-inset-bottom,0px))]' : ''
      }`}
    >
      <MasterScheduleHeader
        calendarLayoutMode={calendarLayoutMode}
        onLayoutModeChange={(mode) => {
          setShowMonthlyView(false)
          setCalendarLayoutMode(mode)
        }}
        showMonthlyView={showMonthlyView}
        showCreateActions={!showMonthlyView && calendarLayoutMode !== 'schedule'}
        focusDay={focusDay}
        weekDates={weekDates}
        masterTimezone={masterSettings?.timezone || masterSettings?.master?.timezone || ''}
        onOpenNewBooking={openNewManualBooking}
        onOpenNewBlock={openNewPersonalBlock}
        onPreviousPeriod={() => {
          if (calendarLayoutMode === 'day') {
            setFocusDay((d) => {
              const next = new Date(d)
              next.setDate(next.getDate() - 1)
              return next
            })
          } else {
            goToPreviousWeek()
          }
        }}
        onNextPeriod={() => {
          if (calendarLayoutMode === 'day') {
            setFocusDay((d) => {
              const next = new Date(d)
              next.setDate(next.getDate() + 1)
              return next
            })
          } else {
            goToNextWeek()
          }
        }}
        onToday={() => {
          if (calendarLayoutMode === 'day') {
            setFocusDay(new Date())
          } else {
            goToCurrentWeek()
          }
        }}
        monthNav={
          showMonthlyView
            ? {
                label: currentMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
                onPrevious: goToPreviousMonth,
                onNext: goToNextMonth,
              }
            : null
        }
      />
      <div
        data-testid="master-schedule-calendar-card"
        className="mt-3 overflow-x-hidden rounded-[var(--dedato-radius-card,16px)] border border-[var(--dedato-border-decorative,#e7e2df)] bg-[var(--dedato-surface-elevated,#fff)] lg:mt-6 lg:px-4"
      >
      <div
        className={`relative min-w-0 max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] ${
          calendarLayoutMode === 'day' && isLg
            ? 'lg:max-h-[600px] lg:overflow-y-auto lg:overflow-x-visible'
            : 'lg:max-h-[600px] lg:overflow-auto'
        } ${isLg ? 'touch-pan-x' : 'touch-auto'}`}
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
        ) : calendarLayoutMode === 'day' ? (
          <MasterScheduleDayCompact
            date={focusDay}
            schedule={schedule}
            bookings={bookings}
            blocks={blocks}
            bookingsLoading={bookingsLoading}
            bookingsError={bookingsError}
            blocksError={blocksError}
            master={masterSettings?.master ?? null}
            hasExtendedStats={hasExtendedStats}
            selection={daySelection}
            onSelect={(sel) => {
              setDaySelection(sel)
              if (sel) setDayCreatePrefill(null)
            }}
            createPrefill={dayCreatePrefill}
            timeZone={masterSettings?.timezone || ''}
            onConfirmBooking={handleMobileConfirm}
            onCancelBookingRequest={(id) => setCancelBookingId(id)}
            actionBookingId={actionBookingId}
            onDetailSaved={async (saved) => {
              setDayCreatePrefill(null)
              await handleDayDetailSaved(saved)
            }}
            onDetailReload={reloadCalendarEvents}
            onIntervalManualCreate={goDayCreateManual}
          />
        ) : calendarLayoutMode === 'schedule' ? (
          <MasterScheduleTemplatePanel
            scheduleRules={scheduleRules}
            scheduleRulesLoading={scheduleRulesLoading}
            scheduleRulesError={scheduleRulesError}
            materializedSchedule={schedule}
            masterTimezone={masterSettings?.timezone || masterSettings?.master?.timezone || ''}
            onCreateSchedule={() => setShowCreateModal(true)}
            onEditSchedule={() => setShowCreateModal(true)}
            onOpenMonthly={() => setShowMonthlyView(true)}
            onOpenSlotManagement={openSlotManagement}
            onOpenPastAppointments={onOpenPastAppointments}
          />
        ) : calendarLayoutMode === 'week' ? (
          <div className={mcWeekCanvas}>
            <MasterScheduleWeekTimeline
              weekDates={weekDates}
              schedule={schedule}
              bookings={bookings}
              blocks={blocks}
              selected={selected}
              isLg={isLg}
              isIosRestrictedContext={isIosRestrictedContext}
              todayRef={todayRef}
              formatLocalDate={formatLocalDate}
              getSlotKey={getSlotKey}
              getTimeLabel={getTimeLabel}
              isSameCalendarDay={isSameCalendarDay}
              onEmptySlotCreate={(day, hour, minute) => {
                const ds = formatLocalDate(day.date)
                const hm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
                goDayCreateManual({ mode: 'manual', dateStr: ds, startIso: `${ds}T${hm}:00` })
              }}
              onSlotMouseDown={handleSlotMouseDown}
              onSlotTapMobile={handleSlotTapMobile}
              onSlotMouseEnter={handleSlotMouseEnter}
              onSlotMouseMove={handleSlotMouseMove}
              onDayLabelClick={handleDayLabelClick}
              openDayDrawerMenu={openDayDrawerMenu}
              onTimeHeaderClick={handleTimeHeaderClick}
              onBookingClickMobile={(booking) => {
                if (booking.source === 'manual') {
                  setComposer({ mode: 'manual', dateStr: wallClock(booking.start_time)?.date || formatLocalDate(focusDay), event: booking })
                } else openMobileBookingDetail(booking)
              }}
              onBookingHover={handleBookingMouseEnter}
              onBookingHoverEnd={handleBookingMouseLeave}
              onBlockClick={(block, day) => setComposer({ mode: 'block', dateStr: formatLocalDate(day.date), event: block })}
              onBookingEditDesktop={(booking, day) => setComposer({ mode: 'manual', dateStr: wallClock(booking.start_time)?.date || formatLocalDate(day.date), event: booking })}
              wallLabel={wallLabel}
            />
          </div>
        ) : null}
      </div>
      </div>
      
      {/* Модальное окно создания расписания */}
      <CreateScheduleModal />
      
      {/* Модальное окно просмотра расписания */}
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
        blocks={blocks}
        purpose={dayDrawerPurpose}
        schedule={schedule}
        onCreateManual={() => {
          setDayDrawerOpen(false)
          setComposer({ mode: 'manual', dateStr: dayDrawerDateStr, event: null })
        }}
        onCreateBlock={() => {
          setDayDrawerOpen(false)
          setComposer({ mode: 'block', dateStr: dayDrawerDateStr, event: null })
        }}
        onEditManual={(booking) => {
          setDayDrawerOpen(false)
          setComposer({ mode: 'manual', dateStr: dayDrawerDateStr, event: booking })
        }}
        onEditBlock={(block) => {
          setDayDrawerOpen(false)
          setComposer({ mode: 'block', dateStr: dayDrawerDateStr, event: block })
        }}
        onSaved={() => {
          loadBookings()
          loadBlocks()
          if (typeof onDayScheduleSaved === 'function') onDayScheduleSaved()
        }}
      />
      <CalendarB3Composer
        open={Boolean(composer)}
        mode={composer?.mode || 'manual'}
        event={composer?.event || null}
        dateStr={composer?.dateStr || ''}
        timeZone={masterSettings?.timezone || ''}
        bookings={bookings}
        blocks={blocks}
        onClose={closeComposer}
        onSaved={() => {
          loadBookings()
          loadBlocks()
        }}
        onReload={async () => ({ bookings: await loadBookings(), blocks: await loadBlocks() })}
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
        onEditManual={popupBooking?.source === 'manual' ? () => {
          setPopupVisible(false)
          setComposer({
            mode: 'manual',
            dateStr: formatLocalDate(new Date(popupBooking.start_time)),
            event: popupBooking,
          })
        } : null}
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
        {calendarLayoutMode === 'day' ? (
          <MasterScheduleDayMobileSheet
            selection={daySelection}
            focusDate={focusDay}
            timeZone={masterSettings?.timezone || ''}
            bookings={bookings}
            blocks={blocks}
            master={masterSettings?.master ?? null}
            hasExtendedStats={hasExtendedStats}
            onClearSelection={() => setDaySelection(null)}
            onConfirmBooking={handleMobileConfirm}
            onCancelBookingRequest={(id) => setCancelBookingId(id)}
            actionBookingId={actionBookingId}
            onSaved={handleDayDetailSaved}
            onReload={reloadCalendarEvents}
            zIndexClass={masterZClass('scheduleDetail')}
          />
        ) : null}
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
          onEditManual={(booking) => openManualComposer(booking)}
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
