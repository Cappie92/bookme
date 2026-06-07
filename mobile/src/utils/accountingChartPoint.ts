import type { ChartPoint } from '@src/services/api/accounting';

type ChartPointLike = ChartPoint & {
  confirmed_income?: number;
  total_income?: number;
  expenses?: number;
  total_expense?: number;
  pending_income?: number;
  /** Явное значение для графика «Общая прибыль» */
  profit?: number;
  value?: number;
};

export type ProfitChartPoint = ChartPoint & { profit?: number; value?: number };

/** YYYY-MM-DD из поля date (без UTC-сдвига через Date.parse). */
export function chartDateToYmd(date: unknown): string | null {
  if (date == null) return null;
  if (typeof date !== 'string') return null;
  const trimmed = date.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  return null;
}

/** Подтверждённый доход дня (как income в GET /accounting/summary chart_data). */
/** Подтверждённые доходы для графика «Доходы и расходы». */
export function getChartConfirmedIncome(point: ChartPointLike): number {
  return chartPointConfirmedIncome(point);
}

export function chartPointConfirmedIncome(point: ChartPointLike): number {
  const income = Number(point.income);
  if (Number.isFinite(income) && income !== 0) return income;
  const confirmed = Number(point.confirmed_income);
  if (Number.isFinite(confirmed) && confirmed !== 0) return confirmed;
  const total = Number(point.total_income);
  if (Number.isFinite(total) && total !== 0) return total;
  return Number.isFinite(income) ? income : 0;
}

/** Ожидаемые доходы для графика «Доходы и расходы». */
export function getChartExpectedIncome(point: ChartPointLike): number {
  const expected = Number(point.expected_income);
  if (Number.isFinite(expected)) return expected;
  const pending = Number(point.pending_income);
  if (Number.isFinite(pending)) return pending;
  return 0;
}

/** Расходы дня (как expense в chart_data). */
export function getChartExpenseValue(point: ChartPointLike): number {
  return chartPointExpense(point);
}

export function chartPointExpense(point: ChartPointLike): number {
  const expense = Number(point.expense);
  if (Number.isFinite(expense) && expense !== 0) return expense;
  const expenses = Number(point.expenses);
  if (Number.isFinite(expenses) && expenses !== 0) return expenses;
  const total = Number(point.total_expense);
  if (Number.isFinite(total) && total !== 0) return total;
  return Number.isFinite(expense) ? expense : 0;
}

/**
 * Дневная прибыль = confirmed income − expense.
 * Не опираемся только на net_profit: в ответах API поле часто 0 при ненулевом income.
 */
export function chartPointNetProfit(point: ChartPointLike): number {
  return chartPointConfirmedIncome(point) - chartPointExpense(point);
}

/** Единое Y-значение для NetProfitChart: линия и tooltip читают одно поле. */
export function getChartProfitValue(point: ChartPointLike): number {
  const profit = Number(point.profit);
  if (Number.isFinite(profit)) return profit;
  const value = Number(point.value);
  if (Number.isFinite(value)) return value;
  const net = Number(point.net_profit);
  if (Number.isFinite(net) && net !== 0) return net;
  return chartPointNetProfit(point);
}

export function isIncomeExpensePointNonZero(point: ChartPointLike): boolean {
  return (
    getChartConfirmedIncome(point) > 0 ||
    getChartExpectedIncome(point) > 0 ||
    getChartExpenseValue(point) > 0
  );
}

export function findFirstNonZeroIncomeExpenseIndex(points: ChartPointLike[]): number {
  return points.findIndex(isIncomeExpensePointNonZero);
}

/** Нормализует поля для TripleLineChart (линия и tooltip читают одни и те же значения). */
export function toIncomeExpenseChartPoint(point: ChartPointLike): ChartPoint {
  const income = getChartConfirmedIncome(point);
  const expected_income = getChartExpectedIncome(point);
  const expense = getChartExpenseValue(point);
  const base = finalizeChartPoint(point);
  return {
    ...base,
    income,
    expected_income,
    expense,
    net_profit: income - expense,
  };
}

export function toProfitChartPoint(point: ChartPointLike): ProfitChartPoint {
  const profit = getChartProfitValue(point);
  const finalized = finalizeChartPoint(point);
  return {
    ...finalized,
    profit,
    value: profit,
    net_profit: profit,
  };
}

/** Нормализует числовые поля точки графика под отображение. */
export function finalizeChartPoint(point: ChartPointLike): ChartPoint {
  const ymd = chartDateToYmd(point.date) ?? (typeof point.date === 'string' ? point.date : '');
  const income = chartPointConfirmedIncome(point);
  const expense = chartPointExpense(point);
  const expected_income = Number(point.expected_income) || 0;
  return {
    ...point,
    date: ymd || point.date,
    income,
    expense,
    expected_income,
    net_profit: income - expense,
  };
}

/** @deprecated alias */
export function enrichChartPoint(point: ChartPoint): ChartPoint {
  return finalizeChartPoint(point);
}
