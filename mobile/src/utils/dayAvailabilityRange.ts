/**
 * Локальное добавление доступности на день: только сетка 30 мин (:00 / :30), совпадает с PUT /schedule/day.
 */

/** Допустимые минуты для start/end day-level интервала */
export const SLOT_MINUTE_STEPS = [0, 30] as const;
export type SlotHalfHourMinute = (typeof SLOT_MINUTE_STEPS)[number];

export function minutesFromMidnight(hour: number, minute: number): number {
  return hour * 60 + minute;
}

/**
 * Полуинтервал [startMin, endMin) в минутах от полуночи.
 * start/end кратны 30 минутам; endHour === 24 → endMin = 1440.
 */
export function resolveDayRangeMinutes(
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number
): { ok: true; startMin: number; endMin: number } | { ok: false; error: string } {
  if (
    startHour < 0 ||
    startHour > 23 ||
    endHour < 0 ||
    endHour > 24 ||
    !SLOT_MINUTE_STEPS.includes(startMinute as SlotHalfHourMinute) ||
    (endHour < 24 && !SLOT_MINUTE_STEPS.includes(endMinute as SlotHalfHourMinute))
  ) {
    return { ok: false, error: 'Выберите время только на :00 или :30.' };
  }
  if (endHour === 24 && endMinute !== 0) {
    return { ok: false, error: 'Для конца дня выберите 24:00.' };
  }

  const startMin = minutesFromMidnight(startHour, startMinute);
  const endMin = endHour === 24 ? 24 * 60 : minutesFromMidnight(endHour, endMinute);

  if (startMin >= endMin) {
    return { ok: false, error: 'Время окончания должно быть позже начала.' };
  }

  if (startMin % 30 !== 0 || endMin % 30 !== 0) {
    return { ok: false, error: 'Интервал должен быть кратен 30 минутам.' };
  }

  return { startMin, endMin, ok: true };
}

/**
 * Все старты 30-мин слотов со строгим условием startMin <= slotStart < endMin
 * (без «расширения» за счёт пересечения).
 */
export function thirtyMinuteSlotsInRange(startMin: number, endMin: number): Array<{ hour: number; minute: number }> {
  if (startMin % 30 !== 0 || endMin % 30 !== 0 || startMin >= endMin) {
    return [];
  }
  const out: Array<{ hour: number; minute: number }> = [];
  for (let t = startMin; t < endMin; t += 30) {
    const hour = Math.floor(t / 60);
    const minute = t % 60;
    out.push({ hour, minute });
  }
  return out;
}
