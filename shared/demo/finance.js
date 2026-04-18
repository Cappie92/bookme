/**
 * Демо-данные для раздела «Финансы».
 * Единый источник для web и mobile. Не создаёт записей в БД.
 */

export const financeSummaryDemo = {
  total_income: 84750.5,
  total_expected_income: 12500,
  total_expense: 3200,
  total_points_spent: 500,
  income_by_date: {
    '2025-01-20': 4200,
    '2025-01-21': 5800,
    '2025-01-22': 3100,
    '2025-01-23': 9200,
    '2025-01-24': 0,
    '2025-01-25': 14500,
    '2025-01-26': 11200,
    '2025-01-27': 9800,
    '2025-01-28': 6500,
    '2025-01-29': 7800,
    '2025-01-30': 8850.5,
  },
  expense_by_date: {
    '2025-01-22': 800,
    '2025-01-25': 1200,
    '2025-01-28': 1200,
  },
};

export const financeOperationsDemo = [
  { id: 1, date: '2025-01-30', amount: 3500, name: 'Стрижка + укладка', type: 'income' },
  { id: 2, date: '2025-01-30', amount: 2100, name: 'Окрашивание', type: 'income' },
  { id: 3, date: '2025-01-29', amount: 2800, name: 'Маникюр', type: 'income' },
  { id: 4, date: '2025-01-29', amount: 5000, name: 'Комплекс услуг', type: 'income' },
  { id: 5, date: '2025-01-28', amount: -1200, name: 'Краска', type: 'expense' },
  { id: 6, date: '2025-01-28', amount: 4100, name: 'Стрижка', type: 'income' },
  { id: 7, date: '2025-01-27', amount: 5200, name: 'Окрашивание + уход', type: 'income' },
  { id: 8, date: '2025-01-26', amount: 4600, name: 'Стрижка + борода', type: 'income' },
  { id: 9, date: '2025-01-25', amount: -1200, name: 'Расходные материалы', type: 'expense' },
  { id: 10, date: '2025-01-25', amount: 8900, name: 'Комплекс', type: 'income' },
  { id: 11, date: '2025-01-24', amount: 0, name: 'Выходной', type: 'income' },
  { id: 12, date: '2025-01-23', amount: 3200, name: 'Маникюр', type: 'income' },
  { id: 13, date: '2025-01-22', amount: -800, name: 'Лак', type: 'expense' },
  { id: 14, date: '2025-01-22', amount: 2500, name: 'Укладка', type: 'income' },
  { id: 15, date: '2025-01-21', amount: 5800, name: 'Окрашивание', type: 'income' },
  { id: 16, date: '2025-01-20', amount: 4200, name: 'Стрижка', type: 'income' },
];
