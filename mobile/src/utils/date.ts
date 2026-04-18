/**
 * Утилиты для работы с датами в календаре расписаний
 * 
 * ⚠️ ВАЖНО:
 * Никогда не использовать new Date("YYYY-MM-DD")
 * Такие даты интерпретируются как UTC и могут сдвигаться в зависимости от таймзоны.
 * 
 * Для дат правил (effectiveStartDate, validUntil и т.п.)
 * всегда использовать parseLocalDate().
 * 
 * Пример:
 *   ❌ const date = new Date("2026-01-12"); // может быть UTC, может сдвинуться
 *   ✅ const date = parseLocalDate("2026-01-12"); // гарантированно локальная дата
 */

/**
 * Парсит дату формата YYYY-MM-DD как ЛОКАЛЬНУЮ календарную дату
 * (без UTC, без смещения таймзоны)
 * 
 * @param ymd - строка в формате YYYY-MM-DD
 * @returns Date объект, представляющий локальную календарную дату (00:00:00 локального времени)
 * 
 * @example
 * parseLocalDate("2026-01-12") // возвращает Date для 12 января 2026, 00:00:00 локального времени
 */
export function parseLocalDate(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  // new Date(year, month - 1, day) создаёт локальную дату (не UTC)
  return new Date(year, month - 1, day);
}

