/**
 * Утилиты для работы с расписанием
 */

// Сокращенные названия дней недели
const DAY_NAMES = {
  monday: 'Пн',
  tuesday: 'Вт', 
  wednesday: 'Ср',
  thursday: 'Чт',
  friday: 'Пт',
  saturday: 'Сб',
  sunday: 'Вс'
}

// Полные названия дней недели
const DAY_NAMES_FULL = {
  monday: 'Понедельник',
  tuesday: 'Вторник',
  wednesday: 'Среда',
  thursday: 'Четверг',
  friday: 'Пятница',
  saturday: 'Суббота',
  sunday: 'Воскресенье'
}

/**
 * Получает название дня недели в нижнем регистре
 */
const getCurrentDayName = () => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayIndex = new Date().getDay()
  return days[dayIndex]
}

/**
 * Форматирует время в читаемый вид
 */
export const formatTime = (timeStr) => {
  if (!timeStr) return ''
  
  // Если время уже в формате HH:MM, возвращаем как есть
  if (timeStr.includes(':')) {
    return timeStr
  }
  
  // Если это объект Date, извлекаем время
  if (timeStr instanceof Date) {
    return timeStr.toTimeString().slice(0, 5)
  }
  
  return timeStr
}

/**
 * Парсит JSON строку с расписанием
 */
export const parseWorkingHours = (workingHoursStr) => {
  if (!workingHoursStr) return null
  
  try {
    // Если это уже объект, возвращаем как есть
    if (typeof workingHoursStr === 'object') {
      return workingHoursStr
    }
    
    // Если это строка, парсим JSON
    if (typeof workingHoursStr === 'string') {
      return JSON.parse(workingHoursStr)
    }
    
    return null
  } catch (error) {
    console.error('Ошибка парсинга расписания:', error)
    return null
  }
}

/**
 * Форматирует расписание в читаемый вид (краткий формат)
 */
export const formatWorkingHoursShort = (workingHoursStr) => {
  const schedule = parseWorkingHours(workingHoursStr)
  if (!schedule) return 'Расписание не указано'
  
  const days = []
  
  Object.entries(schedule).forEach(([day, config]) => {
    if (config.enabled) {
      const dayName = DAY_NAMES[day]
      const openTime = formatTime(config.open)
      const closeTime = formatTime(config.close)
      days.push(`${dayName}: ${openTime}-${closeTime}`)
    }
  })
  
  if (days.length === 0) {
    return 'Закрыто'
  }
  
  return days.join(', ')
}

/**
 * Форматирует расписание в читаемый вид (полный формат)
 */
export const formatWorkingHoursFull = (workingHoursStr) => {
  const schedule = parseWorkingHours(workingHoursStr)
  if (!schedule) return 'Расписание не указано'
  
  const days = []
  
  Object.entries(schedule).forEach(([day, config]) => {
    const dayName = DAY_NAMES_FULL[day]
    if (config.enabled) {
      const openTime = formatTime(config.open)
      const closeTime = formatTime(config.close)
      days.push(`${dayName}: ${openTime}-${closeTime}`)
    } else {
      days.push(`${dayName}: закрыто`)
    }
  })
  
  return days.join('\n')
}

/**
 * Форматирует расписание в читаемый вид (сокращенный формат)
 */
export const formatWorkingHoursCompact = (workingHoursStr) => {
  const schedule = parseWorkingHours(workingHoursStr)
  if (!schedule) return 'Расписание не указано'
  
  const days = []
  
  Object.entries(schedule).forEach(([day, config]) => {
    const dayName = DAY_NAMES[day]
    if (config.enabled) {
      const openTime = formatTime(config.open)
      const closeTime = formatTime(config.close)
      days.push(`${dayName}: ${openTime}-${closeTime}`)
    } else {
      days.push(`${dayName}: закрыто`)
    }
  })
  
  return days.join('\n')
}

/**
 * Проверяет, открыт ли салон в данный момент
 */
export const isCurrentlyOpen = (workingHoursStr, timezone = 'Europe/Moscow') => {
  const schedule = parseWorkingHours(workingHoursStr)
  if (!schedule) return false
  
  // Получаем текущее время в временной зоне салона
  const now = new Date()
  const salonTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  
  const currentDay = getCurrentDayName()
  const currentTime = salonTime.toTimeString().slice(0, 5)
  
  const todaySchedule = schedule[currentDay]
  if (!todaySchedule || !todaySchedule.enabled) {
    return false
  }
  
  const openTime = formatTime(todaySchedule.open)
  const closeTime = formatTime(todaySchedule.close)
  
  return currentTime >= openTime && currentTime <= closeTime
}

/**
 * Получает статус работы (открыто/закрыто) с временем
 */
export const getWorkingStatus = (workingHoursStr, timezone = 'Europe/Moscow') => {
  const schedule = parseWorkingHours(workingHoursStr)
  if (!schedule) return { status: 'unknown', message: 'Расписание не указано' }
  
  // Получаем текущее время в временной зоне салона
  const now = new Date()
  const salonTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  
  const currentDay = getCurrentDayName()
  const currentTime = salonTime.toTimeString().slice(0, 5)
  
  const todaySchedule = schedule[currentDay]
  if (!todaySchedule) {
    return { status: 'unknown', message: 'Расписание не указано' }
  }
  
  if (!todaySchedule.enabled) {
    return { status: 'closed', message: 'Сегодня не работает' }
  }
  
  const openTime = formatTime(todaySchedule.open)
  const closeTime = formatTime(todaySchedule.close)
  
  if (currentTime < openTime) {
    return { 
      status: 'closed', 
      message: `Сейчас не работает` 
    }
  }
  
  if (currentTime > closeTime) {
    return { 
      status: 'closed', 
      message: `Сейчас не работает` 
    }
  }
  
  return { 
    status: 'open', 
    message: `Сейчас работает` 
  }
} 