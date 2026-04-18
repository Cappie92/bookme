/**
 * Форматирует сумму денег в рубли
 * 
 * Требования:
 * - Разделитель тысяч: неразрывный пробел \u00A0
 * - Копейки не показываем (всегда целое число)
 * 
 * @param value - сумма (число или строка)
 * @param currency - валюта (по умолчанию '₽')
 * @returns отформатированная строка, например: "100 000 ₽"
 * 
 * @example
 * formatMoney(100000) // "100 000 ₽"
 * formatMoney(1234.56) // "1 235 ₽" (округление)
 * formatMoney(0) // "0 ₽"
 */
export function formatMoney(value: number | string | null | undefined, currency: string = '₽'): string {
  if (value === null || value === undefined || value === '') {
    return `0 ${currency}`;
  }
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return `0 ${currency}`;
  }
  
  // Округляем до целого (отбрасываем копейки)
  const rounded = Math.round(numValue);
  
  // Форматируем с разделителем тысяч (неразрывный пробел)
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  
  return `${formatted} ${currency}`;
}

