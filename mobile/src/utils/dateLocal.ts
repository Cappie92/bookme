/** Локальная дата YYYY-MM-DD (не UTC). */
export function toLocalYmd(dateLike: string | Date): string {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Сравнение календарного дня в локальной таймзоне устройства. */
export function isSameLocalDay(dateLike: string | Date, targetDate: Date = new Date()): boolean {
  const ymd = toLocalYmd(dateLike);
  if (!ymd) return false;
  return ymd === toLocalYmd(targetDate);
}
