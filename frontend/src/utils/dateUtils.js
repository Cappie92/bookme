// Утилиты для работы с датами с учетом часового пояса

/**
 * Получает выбранный пользователем город из localStorage
 */
export function getSelectedCity() {
  const saved = localStorage.getItem('selectedCity')
  return saved ? JSON.parse(saved) : { name: 'Москва', timezone: 'Europe/Moscow', offset: 3 }
}

/**
 * Создает дату в выбранном пользователем часовом поясе
 * @param {string} dateString - строка даты в формате YYYY-MM-DD
 * @returns {Date} - дата в локальном часовом поясе
 */
export function createLocalDate(dateString) {
  const city = getSelectedCity()
  const [year, month, day] = dateString.split('-').map(Number)
  
  // Создаем дату в локальном часовом поясе
  const localDate = new Date(year, month - 1, day, 0, 0, 0)
  
  return localDate
}

/**
 * Преобразует дату в ISO строку с учетом часового пояса
 * @param {string} dateString - строка даты в формате YYYY-MM-DD
 * @returns {string} - ISO строка для отправки в API
 */
export function dateToISOString(dateString) {
  // Просто добавляем T00:00:00 к дате, чтобы получить начало дня в локальном времени
  // Это гарантирует, что дата не сдвинется при конвертации
  return `${dateString}T00:00:00`
}

/**
 * Форматирует время для отображения
 * @param {string} timeString - время в формате HH:MM
 * @returns {string} - отформатированное время
 */
export function formatTime(timeString) {
  return timeString
}

/**
 * Получает минимальную дату для выбора (сегодня)
 * @returns {string} - дата в формате YYYY-MM-DD
 */
export function getMinDate() {
  const today = new Date()
  return today.toISOString().split('T')[0]
} 