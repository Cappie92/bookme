/**
 * Парсинг максимальной суммы персональной скидки для API.
 * Пустая строка или 0 => без лимита (backend: null и 0 трактуются одинаково).
 */
export function parseMaxDiscountAmountForApi(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(',', '.');
  const value = parseFloat(normalized);
  if (Number.isNaN(value)) return null;
  if (value === 0) return 0;
  return value;
}

/** Есть ли ограничение по сумме (для отображения в списке). */
export function hasMaxDiscountAmountLimit(value: number | null | undefined): boolean {
  return value != null && value > 0;
}
