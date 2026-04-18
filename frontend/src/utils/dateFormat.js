/**
 * Единая утилита форматирования дат/времени для проекта.
 * Использовать в AllBookingsModal, MasterDashboardStats, public booking и т.д.
 */

/**
 * Форматирует дату в DD.MM.YY (год 2-значный)
 * @param {string|Date} value - ISO-строка или Date
 * @returns {string}
 */
export function formatDateShort(value) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}.${month}.${year}`;
}

/**
 * Форматирует время HH:MM
 * @param {string|Date} value - ISO-строка или Date
 * @returns {string}
 */
export function formatTimeShort(value) {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Форматирует таймзону мастера в человекочитаемый вид.
 * Примеры:
 * - Europe/Moscow -> "Москва (UTC+3)"
 * - Europe/London -> "Лондон (UTC+0)"
 * - иначе: "UTC+X (IANA: <tz>)"
 *
 * Без внешних зависимостей, оффсет берётся через Intl.DateTimeFormat + timeZoneName: 'shortOffset'.
 */
export function formatTimezoneLabel(tz) {
  if (!tz || typeof tz !== 'string') return '';

  const cityMap = {
    'Europe/Moscow': 'Москва',
    'Europe/Samara': 'Самара',
    'Europe/London': 'Лондон',
    'Europe/Berlin': 'Берлин',
    'Europe/Paris': 'Париж',
    'Europe/Rome': 'Рим',
    'Europe/Madrid': 'Мадрид',
    'Europe/Prague': 'Прага',
    'Europe/Warsaw': 'Варшава',
    'Asia/Yekaterinburg': 'Екатеринбург',
    'Asia/Novosibirsk': 'Новосибирск',
    'Asia/Krasnoyarsk': 'Красноярск',
    'Asia/Vladivostok': 'Владивосток',
    'Asia/Almaty': 'Алматы',
    'Asia/Bishkek': 'Бишкек',
    'Asia/Tbilisi': 'Тбилиси',
    'Asia/Tokyo': 'Токио',
    'America/New_York': 'Нью‑Йорк',
    'America/Los_Angeles': 'Лос‑Анджелес',
  };

  let offsetLabel = '';
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'shortOffset',
    });
    const parts = dtf.formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (tzPart && typeof tzPart.value === 'string') {
      // Примеры: "GMT+3", "UTC+1"
      offsetLabel = tzPart.value.replace('GMT', 'UTC');
    }
  } catch {
    // Если таймзона не поддерживается, оставляем offsetLabel пустым
  }

  const city = cityMap[tz] || null;

  if (city && offsetLabel) {
    return `${city} (${offsetLabel})`;
  }
  if (offsetLabel) {
    return `${offsetLabel} (IANA: ${tz})`;
  }
  // Фоллбек, если Intl не дал offset
  const shortTz = tz.split('/').pop() || tz;
  return `IANA: ${shortTz}`;
}

