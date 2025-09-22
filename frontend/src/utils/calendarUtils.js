import { 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  addWeeks,
  subWeeks,
  getDay,
  addDays,
  subDays
} from 'date-fns'
import { ru } from 'date-fns/locale'

// Настройка для русской локали с понедельником как первым днем недели
const weekStartsOn = 1 // Понедельник

/**
 * Получает дни недели для указанной даты
 * @param {Date} date - Дата в неделе
 * @returns {Array} Массив дней недели (понедельник - воскресенье)
 */
export function getWeekDays(date) {
  // Собственная логика для создания массива дней недели
  const start = new Date(date)
  
  // Собственные сокращения дней недели в 2 символа
  const weekdayNames = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
  
  const days = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(start)
    day.setDate(start.getDate() + i)
    
    const dayOfWeek = getDayOfWeek(day)
    const weekdayIndex = dayOfWeek - 1
    const weekdayName = weekdayNames[weekdayIndex]
    
    
    days.push({
      date: day,
      label: `${weekdayName} ${format(day, 'dd MMM', { locale: ru }).replace(/\./g, '')}`,
      dayOfWeek: dayOfWeek
    })
  }
  
  return days
}

/**
 * Получает дни месяца для календаря
 * @param {Date} month - Месяц
 * @returns {Array} Массив дней месяца (6 недель)
 */
export function getMonthDays(month) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn, locale: ru })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn, locale: ru })
  
  return eachDayOfInterval({ start, end }).map(day => {
    // Создаем новую дату с правильным часовым поясом
    const correctDate = new Date(day.getFullYear(), day.getMonth(), day.getDate())
    
    return {
      date: correctDate,
      dateStr: format(correctDate, 'yyyy-MM-dd'),
      isCurrentMonth: isSameMonth(correctDate, month),
      isToday: isSameDay(correctDate, new Date()),
      dayOfWeek: getDayOfWeek(correctDate)
    }
  })
}

/**
 * Получает номер дня недели (1-7, где 1 = понедельник)
 * @param {Date} date - Дата
 * @returns {number} Номер дня недели
 */
export function getDayOfWeek(date) {
  const day = getDay(date)
  return day === 0 ? 7 : day // Воскресенье = 7, остальные как есть
}

/**
 * Вычисляет week_offset для перехода к указанной дате
 * @param {Date} targetDate - Целевая дата
 * @returns {number} week_offset
 */
export function calculateWeekOffset(targetDate) {
  const today = new Date()
  const targetMonday = startOfWeek(targetDate, { weekStartsOn, locale: ru })
  const currentMonday = startOfWeek(today, { weekStartsOn, locale: ru })
  
  const diffTime = targetMonday.getTime() - currentMonday.getTime()
  return Math.round(diffTime / (7 * 24 * 60 * 60 * 1000))
}

/**
 * Получает понедельник недели для указанного week_offset
 * @param {number} weekOffset - Смещение недели
 * @returns {Date} Понедельник недели
 */
export function getWeekMonday(weekOffset) {
  const today = new Date()
  const currentMonday = startOfWeek(today, { weekStartsOn, locale: ru })
  
  if (weekOffset === 0) {
    return currentMonday
  } else if (weekOffset > 0) {
    return addWeeks(currentMonday, weekOffset)
  } else {
    return subWeeks(currentMonday, Math.abs(weekOffset))
  }
}

/**
 * Проверяет, есть ли рабочие слоты в указанный день
 * @param {Date} date - Дата
 * @param {Object} schedule - Расписание { [date_time]: true/false }
 * @returns {boolean} Есть ли рабочие слоты
 */
export function hasWorkingSlots(date, schedule) {
  if (!schedule) return false
  
  const dateStr = format(date, 'yyyy-MM-dd')
  const workingSlots = Object.keys(schedule).filter(key => {
    if (key.startsWith(dateStr + '_')) {
      return schedule[key] === true
    }
    return false
  })
  
  // Отладочная информация
  
  return workingSlots.length > 0
}

/**
 * Форматирует время для отображения
 * @param {number} hour - Час
 * @param {number} minute - Минута
 * @returns {string} Отформатированное время
 */
export function formatTime(hour, minute) {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
}

/**
 * Получает название месяца на русском языке
 * @param {Date} date - Дата
 * @returns {string} Название месяца
 */
export function getMonthName(date) {
  // Собственные сокращения месяцев в 3 символа
  const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  const month = monthNames[date.getMonth()]
  const year = date.getFullYear()
  return `${month} ${year}`
}

/**
 * Получает сокращенные названия дней недели
 * @returns {Array} Массив сокращенных названий дней недели
 */
export function getDayNames() {
  return ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
}

/**
 * Получает даты недели для указанного смещения
 * @param {number} weekOffset - Смещение недели
 * @returns {Array} Массив дней недели
 */
export function getWeekDates(weekOffset = 0) {
  const today = new Date()
  
  // Собственная логика для вычисления понедельника
  const currentDay = today.getDay() // 0 = воскресенье, 1 = понедельник, ..., 6 = суббота
  const daysToMonday = currentDay === 0 ? -6 : 1 - currentDay // Количество дней до понедельника
  const currentMonday = new Date(today)
  currentMonday.setDate(today.getDate() + daysToMonday)
  
  // Добавляем offset недель
  const targetMonday = addWeeks(currentMonday, weekOffset)
  
  const result = getWeekDays(targetMonday)
  
  return result
}

/**
 * Форматирует ключ слота расписания
 * @param {Date} date - Дата
 * @param {number} hour - Час
 * @param {number} minute - Минута
 * @returns {string} Ключ слота (YYYY-MM-DD_HH_MM)
 */
export function getSlotKey(date, hour, minute) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const h = hour.toString().padStart(2, '0')
  const m = minute.toString().padStart(2, '0')
  return `${year}-${month}-${day}_${h}_${m}`
}
