/**
 * Форматирует сумму денег в рубли
 */
export function formatMoney(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '0.00 ₽';
  }
  return `${amount.toFixed(2)} ₽`;
}

