/**
 * Форматирует сумму денег с разделителями разрядов (пробелы) и без копеек
 * @param {number} amount - Сумма в рублях (может быть с копейками)
 * @returns {string} Отформатированная строка, например "1 000 000 ₽"
 */
export function formatMoney(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '0 ₽'
  }
  
  // Округляем до целого числа (убираем копейки)
  const roundedAmount = Math.round(Number(amount))
  
  // Форматируем с разделителями разрядов (пробелы)
  const formatted = roundedAmount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  
  return `${formatted} ₽`
}

