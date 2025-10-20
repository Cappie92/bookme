import React, { useState, useRef } from 'react'
import ConflictsList from './ConflictsList'
import PopupCard from './PopupCard'
import { getMonthDays, calculateWeekOffset, hasWorkingSlots, getMonthName, getDayNames, getWeekDates } from '../utils/calendarUtils'

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
const MINUTES = [0, 10, 20, 30, 40, 50]


function getTimeLabel(hour, minute) {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
}

function getSlotKey(date, hour, minute) {
  return `${date.toISOString().split('T')[0]}_${hour}_${minute}`
}

export default function MasterScheduleCalendar({ schedule, onChange, currentWeekOffset, setCurrentWeekOffset, onWeekChange, allConflicts = [] }) {
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
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [scheduleRules, setScheduleRules] = useState(null)
  const [bookings, setBookings] = useState([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [popupVisible, setPopupVisible] = useState(false)
  const [popupBooking, setPopupBooking] = useState(null)
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 })
  
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
      const response = await fetch('/api/master/schedule/rules', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.has_settings) {
          setScheduleRules(data)
        }
      }
    } catch (error) {
      console.error('Ошибка при загрузке правил расписания:', error)
    }
  }

  // Загружаем записи мастера
  const loadBookings = async () => {
    setBookingsLoading(true)
    try {
      const response = await fetch('/api/master/bookings/detailed', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        setBookings(data)
      }
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

  // Функции навигации по неделям
  const goToPreviousWeek = () => {
    setCurrentWeekOffset(prev => prev - 1)
    setSelected(new Set()) // Очищаем выделение при смене недели
  }

  // Функции для месячного обзора
  const loadMonthlySchedule = async () => {
    try {
      const token = localStorage.getItem('access_token')
      if (!token) return

      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth() + 1

      const response = await fetch(`/api/master/schedule/monthly?year=${year}&month=${month}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        // Преобразуем слоты в формат для календаря
        const scheduleDict = {}
        data.slots.forEach(slot => {
          const key = `${slot.schedule_date}_${slot.hour}_${slot.minute}`
          scheduleDict[key] = {
            is_working: slot.is_working,
            work_type: slot.work_type,
            has_conflict: slot.has_conflict,
            conflict_type: slot.conflict_type
          }
        })
        setMonthlySchedule(scheduleDict)
      }
    } catch (error) {
      console.error('Ошибка загрузки месячного расписания:', error)
    }
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
      const response = await fetch('/api/master/schedule/weekly', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
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
      })

      if (!response.ok) {
        console.error('Ошибка при удалении личного расписания')
        // Откатываем изменения при ошибке
        const newSchedule = { ...schedule }
        Object.keys(updates).forEach(key => {
          delete newSchedule[key]
        })
        onChange(newSchedule)
      }
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

  // Выделение слота (клик или drag)
  const handleSlotMouseDown = (slotKey, isActive, dayIndex, timeIndex) => (e) => {
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

  const handleSlotMouseEnter = (slotKey) => () => {
    if (!dragging) return
    setSelected(prev => {
      const next = new Set(prev)
      if (dragMode === 'select') next.add(slotKey)
      if (dragMode === 'deselect') next.delete(slotKey)
      return next
    })
  }

  // Обработка перетаскивания с улучшенной логикой
  const handleSlotMouseMove = (slotKey, dayIndex, timeIndex) => () => {
    if (!dragging || !dragStart) return
    
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

  // Автоматическая прокрутка при перетаскивании
  const handleTableMouseMove = (e) => {
    if (!dragging || !tableRef.current) return
    
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

  // Автопрокрутка к 8 утра при монтировании
  React.useEffect(() => {
    const scrollTo8AM = () => {
      if (tableRef.current) {
        // 8 часов * 2 слота в час * 32px высота строки = 512px
        const scrollPosition = 8 * 6 * 24
        tableRef.current.scrollTop = scrollPosition
      }
    }
    
    // Прокручиваем с несколькими задержками для надежности
    scrollTo8AM()
    setTimeout(scrollTo8AM, 50)
    setTimeout(scrollTo8AM, 200)
    setTimeout(scrollTo8AM, 500)
  }, []) // Только при монтировании

  // Автопрокрутка к 8 утра при изменении расписания
  React.useEffect(() => {
    const scrollTo8AM = () => {
    if (tableRef.current) {
        // 8 часов * 2 слота в час * 32px высота строки = 512px
        const scrollPosition = 8 * 6 * 24
        tableRef.current.scrollTop = scrollPosition
      }
    }
    
    if (schedule) {
      scrollTo8AM()
      setTimeout(scrollTo8AM, 100)
    }
  }, [schedule]) // При изменении расписания

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
        const requestData = {
          type: scheduleType,
          validUntil: validUntil // Дата уже в формате YYYY-MM-DD
        }

        if (scheduleType === 'weekdays') {
          requestData.weekdays = weekdays
        } else if (scheduleType === 'monthdays') {
          requestData.monthdays = monthdays
        } else if (scheduleType === 'shift') {
          requestData.shiftConfig = shiftConfig
        }


        const response = await fetch('/api/master/schedule/rules', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(requestData)
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || 'Ошибка при создании расписания')
        }

        const result = await response.json()
        
        // Сохраняем данные о созданном расписании
        const scheduleData = {
          type: scheduleType,
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
                  className="mr-2"
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
                  className="mr-2"
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
                  className="mr-2"
                />
                Сменный график
              </label>
            </div>
            {errors.scheduleType && <p className="text-red-500 text-sm mt-1">{errors.scheduleType}</p>}
          </div>

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
                        className="mr-2"
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

                    const response = await fetch('/api/master/schedule/future', {
                      method: 'DELETE',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                      }
                    })

                    if (response.ok) {
                      const result = await response.json()
                      alert(`Расписание успешно удалено. Удалено слотов: ${result.deleted_slots}`)
                      
                      // Очищаем локальное хранилище и закрываем модальное окно
                      localStorage.removeItem('lastCreatedSchedule')
                      setLastCreatedSchedule(null)
                      setShowViewModal(false)
                      
                      // Перезагружаем расписание
                      if (onChange) {
                        onChange({})
                      }
                    } else {
                      const error = await response.json()
                      alert(`Ошибка при удалении расписания: ${error.detail}`)
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
    const [currentMonth, setCurrentMonth] = useState(new Date())
    
    if (!showMonthlyView) return null;
    
    // Генерируем календарь на месяц
    const generateMonthlyCalendar = () => {
      const days = getMonthDays(currentMonth)
      
      // Отладочная информация о schedule
      
      // Добавляем информацию о рабочих слотах
      return days.map(day => {
        const hasWorking = hasWorkingSlots(day.date, schedule)
        return {
          ...day,
          hasWorkingSlots: hasWorking
        }
      })
    }

    const handleDayClick = (day) => {
      if (!day.isCurrentMonth) return
      
      // Вычисляем week_offset для перехода к нужной неделе
      const weekOffset = calculateWeekOffset(day.date)
      
      // Переходим к нужной неделе
      if (onWeekChange) {
        onWeekChange(weekOffset)
      }
      
      // Закрываем модальное окно
      setShowMonthlyView(false)
    }

    const goToPreviousMonth = () => {
      setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))
    }

    const goToNextMonth = () => {
      setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))
    }

    const days = generateMonthlyCalendar()
    const monthName = getMonthName(currentMonth)
    const dayNames = getDayNames()

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowMonthlyView(false)}>
        <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Обзор месяца</h2>
            <button
              onClick={() => setShowMonthlyView(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Навигация по месяцам */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={goToPreviousMonth}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="text-xl font-semibold">
              {monthName}
            </h3>
            <button
              onClick={goToNextMonth}
              className="p-2 rounded hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          
          {/* Календарь */}
          <div className="grid grid-cols-7 gap-1">
            {/* Заголовки дней недели */}
            {dayNames.map(day => (
              <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
                {day}
              </div>
            ))}
            
            {/* Дни месяца */}
            {days.map((day, index) => (
              <button
                key={index}
                onClick={() => handleDayClick(day)}
                className={`
                  p-2 text-center text-sm rounded transition-colors
                  ${!day.isCurrentMonth ? 'text-gray-300' : ''}
                  ${day.isToday ? 'bg-blue-100 text-blue-800 font-bold' : ''}
                  ${day.hasWorkingSlots ? 'bg-green-100 hover:bg-green-200' : 'bg-gray-50 hover:bg-gray-100'}
                  ${day.isCurrentMonth ? 'cursor-pointer' : 'cursor-default'}
                `}
                disabled={!day.isCurrentMonth}
              >
                {day.date.getDate()}
                {day.hasWorkingSlots && (
                  <div className="w-2 h-2 bg-green-500 rounded-full mx-auto mt-1"></div>
                )}
              </button>
            ))}
          </div>
          
          {/* Легенда */}
          <div className="mt-6 flex items-center justify-center space-x-6 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-green-100 rounded"></div>
              <span>Рабочие дни</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-gray-50 rounded"></div>
              <span>Выходные дни</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-blue-100 rounded"></div>
              <span>Сегодня</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Компонент месячного календаря
  const MonthlyCalendarView = ({ currentMonth, monthlySchedule, onDateClick }) => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    
    // Получаем первый день месяца и количество дней
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    
    // Получаем первый день недели (0 = воскресенье, 1 = понедельник)
    const firstDayOfWeek = firstDay.getDay()
    const adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1 // Преобразуем в понедельник = 0
    
    // Создаем массив дней для отображения
    const days = []
    
    // Добавляем пустые ячейки для начала месяца
    for (let i = 0; i < adjustedFirstDay; i++) {
      days.push(null)
    }
    
    // Добавляем дни месяца
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day)
      days.push({
        date,
        day,
        isCurrentMonth: true
      })
    }
    
    // Получаем статистику для дня
    const getDayStats = (date) => {
      if (!monthlySchedule) return { hasWork: false, hasConflict: false, workType: null }
      
      const dateStr = date.toISOString().split('T')[0]
      let hasWork = false
      let hasConflict = false
      let workType = null
      
      // Проверяем все слоты дня
      for (let hour = 0; hour < 24; hour++) {
        for (let minute of [0, 30]) {
          const key = `${dateStr}_${hour}_${minute}`
          const slotData = monthlySchedule[key]
          if (slotData && slotData.is_working) {
            hasWork = true
            if (slotData.has_conflict) {
              hasConflict = true
            }
            if (slotData.work_type) {
              workType = slotData.work_type
            }
          }
        }
      }
      
      return { hasWork, hasConflict, workType }
    }
    
    return (
      <div className="p-4">
        <div className="grid grid-cols-7 gap-1">
          {/* Заголовки дней недели */}
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
            <div key={day} className="text-center text-sm font-semibold text-gray-600 py-2">
              {day}
            </div>
          ))}
          
          {/* Дни месяца */}
          {days.map((day, index) => {
            if (!day) {
              return <div key={index} className="h-16"></div>
            }
            
            const stats = getDayStats(day.date)
            const isToday = day.date.toDateString() === new Date().toDateString()
            
            let dayClass = 'h-16 border border-gray-200 p-2 cursor-pointer hover:bg-gray-50 transition-colors '
            
            if (isToday) {
              dayClass += 'bg-blue-50 border-blue-300 '
            }
            
            if (stats.hasWork) {
              if (stats.hasConflict) {
                dayClass += 'bg-red-100 border-red-300 '
              } else if (stats.workType === 'salon') {
                dayClass += 'bg-blue-100 border-blue-300 '
              } else {
                dayClass += 'bg-green-100 border-green-300 '
              }
            }
            
            return (
              <div
                key={index}
                className={dayClass}
                onClick={() => onDateClick(day.date)}
              >
                <div className="text-sm font-medium">
                  {day.day}
                </div>
                {stats.hasWork && (
                  <div className="text-xs mt-1">
                    {stats.hasConflict ? '⚠️' : stats.workType === 'salon' ? '🏢' : '👤'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg overflow-x-auto bg-white mx-auto max-w-8xl px-4">
      {/* Верхняя строка: заголовок и кнопки навигации */}
      <div className="flex items-center justify-between px-6 py-2 border-b bg-gray-50 sticky top-0 z-10 -mx-4">
        <div className="flex items-center gap-4">
          <div className="font-semibold">
            {showMonthlyView ? 'Расписание на месяц' : 'Расписание на неделю'}
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            </>
          )}
        </div>
      </div>

      {/* Вторая строка: кнопки управления расписанием */}
      <div className="flex items-center justify-between px-6 py-2 border-b bg-gray-50 -mx-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-1 text-sm text-white rounded transition-colors"
            style={{ backgroundColor: '#4CAF50' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#45a049'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#4CAF50'}
            title="Создать расписание"
          >
            Создать расписание
          </button>
          <button
            onClick={() => setShowViewModal(true)}
            className="px-3 py-1 text-sm text-white rounded transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#2196F3' }}
            onMouseEnter={(e) => !e.target.disabled && (e.target.style.backgroundColor = '#1976D2')}
            onMouseLeave={(e) => !e.target.disabled && (e.target.style.backgroundColor = '#2196F3')}
            disabled={!lastCreatedSchedule}
            title="Посмотреть расписание"
          >
            Посмотреть расписание
          </button>
          <button
            onClick={() => setShowMonthlyView(true)}
            className="px-3 py-1 text-sm text-white rounded transition-colors"
            style={{ backgroundColor: '#FF9800' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#F57C00'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#FF9800'}
            title="Обзор месяца"
          >
            Обзор месяца
          </button>
        </div>
        <div className="flex gap-2">
          <button
            className="text-white px-3 py-1 text-sm rounded transition-colors disabled:opacity-50"
            style={{ backgroundColor: '#4CAF50' }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#45a049'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#4CAF50'}
            onClick={() => handleSetWorking(true)}
            disabled={selected.size === 0 || saving}
          >
            {saving ? 'Сохранение...' : 'Установить рабочее время'}
          </button>
          <button
            className="bg-gray-300 text-gray-700 px-3 py-1 text-sm rounded hover:bg-gray-400 transition-colors disabled:opacity-50"
            onClick={() => handleSetWorking(false)}
            disabled={selected.size === 0 || saving}
          >
            {saving ? 'Сохранение...' : 'Установить нерабочее время'}
          </button>
        </div>
      </div>
      <div
        className="overflow-y-auto relative"
        style={{ maxHeight: 600 }}
        ref={tableRef}
        onMouseUp={handleMouseUp}
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
          <MonthlyCalendarView 
            currentMonth={currentMonth}
            monthlySchedule={monthlySchedule}
            onDateClick={(date) => {
              // Переключаемся на недельный вид для выбранной даты
              const targetWeek = Math.floor((date - new Date()) / (7 * 24 * 60 * 60 * 1000))
              setCurrentWeekOffset(targetWeek)
              setShowMonthlyView(false)
            }}
          />
        ) : (
          <table id="schedule-table" className="w-full select-none" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="w-16"></th>
                {weekDates.map(day => (
                  <th
                    key={day.date.toISOString().split('T')[0]}
                    className="text-center cursor-pointer px-2 py-1 text-sm font-semibold text-gray-700"
                    style={{ transition: 'background-color 0.2s', width: '160px' }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#DFF5EC'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = ''}
                    onClick={() => handleDayHeaderClick(day.date.toISOString().split('T')[0])}
                  >
                    {day.label}
                  </th>
                ))}
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
                    const isSelected = selected.has(slotKey)
                    const timeIndex = hour * 6 + (minute / 10)
                    const slotBookings = getBookingsForSlot(day.date, hour, minute)
                    
                    // Определяем цвет ячейки
                    let cellClass = 'h-6 cursor-pointer transition-colors border border-gray-200 relative '
                    if (isSelected) {
                      cellClass += 'selected-slot'
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
                        onMouseDown={handleSlotMouseDown(slotKey, isActive, dayIndex, timeIndex)}
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
              )))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Легенда цветографики */}
      <div className="flex items-center justify-between px-6 py-3 border-t bg-gray-50 -mx-4">
        <div className="flex items-center gap-6">
          <h4 className="text-sm font-medium text-gray-700">Легенда расписания:</h4>
          <div className="flex items-center gap-4 text-xs">
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
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#DFF5EC', border: '1px solid #4CAF50' }}></div>
              <span className="text-gray-600">Выделено для изменения</span>
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-400">* Для массового выделения используйте drag&drop или клики по заголовкам дней/времени</div>
      </div>

      {/* Список конфликтов расписания */}
      <div className="px-6 py-4 border-t bg-gray-50 -mx-4">
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
                      <div key={date} className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          <div>
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
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleGoToDate(conflictDate)}
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors group relative"
                            title="Перейти к дню - переключиться на недельный вид и показать выбранную дату"
                            style={{ transitionDelay: '0ms' }}
                          >
                            📅
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-75 pointer-events-none whitespace-nowrap z-50">
                              Перейти к дню
                            </div>
                          </button>
                          <button
                            onClick={() => handleResolveConflict(`${date}_${conflicts[0].start_time.replace(':', '_')}`, 'remove')}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-100 rounded-lg transition-colors group relative"
                            title="Удалить конфликт в собственном расписании - пометить личный календарь в этот день как нерабочий"
                            style={{ transitionDelay: '0ms' }}
                          >
                            🗑️
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-75 pointer-events-none whitespace-nowrap z-50">
                              Удалить конфликт
                            </div>
                          </button>
                          <button
                            onClick={() => handleIgnoreConflict(date)}
                            className="p-2 text-gray-600 hover:text-yellow-600 hover:bg-yellow-100 rounded-lg transition-colors group relative"
                            title="Игнорировать - перестать обращать внимание на этот конфликт"
                            style={{ transitionDelay: '0ms' }}
                          >
                            👁️‍🗨️
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-75 pointer-events-none whitespace-nowrap z-50">
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