/**
 * Утилиты форматирования дат и времени для отображения записей.
 * Даты парсятся из ISO-строк (start_time/end_time), отображаются в локальном времени устройства.
 */

/**
 * Формат даты DD.MM (например, 28.02)
 */
export function formatDateDDMM(dateString: string): string {
  const date = parseBookingDate(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}`;
}

/**
 * Формат времени HH:MM (например, 10:00)
 */
export function formatTimeHHMM(dateString: string): string {
  const date = parseBookingDate(dateString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Диапазон времени "10:00–10:30"
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatTimeHHMM(startTime)}–${formatTimeHHMM(endTime)}`;
}

/**
 * Компактная строка для карточки: "28.02 • 10:00–10:30"
 */
export function formatBookingDateTime(startTime: string, endTime: string): string {
  return `${formatDateDDMM(startTime)} • ${formatTimeRange(startTime, endTime)}`;
}

/**
 * Длительность в минутах (например, "30 мин")
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || isNaN(minutes)) return '';
  return `${minutes} мин`;
}

const WEEKDAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/**
 * Дата для выбора: "сегодня", "завтра" или "28.02, Пн"
 */
export function formatDateForPicker(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  if (target.getTime() === today.getTime()) return 'Сегодня';
  if (target.getTime() === tomorrow.getTime()) return 'Завтра';
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const wd = WEEKDAYS_RU[d.getDay()];
  return `${day}.${month}, ${wd}`;
}

/**
 * Парсит ISO datetime из API. new Date(iso) даёт локальное время на устройстве.
 */
function parseBookingDate(dateString: string): Date {
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) {
    if (__DEV__) {
      console.warn('[format] Invalid date string:', dateString);
    }
    return new Date();
  }
  return parsed;
}
