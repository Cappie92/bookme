/**
 * Единая палитра вкладки «Финансы» (web). Не использовать на других экранах без осознанного решения.
 * Значения привязаны к shared/theme/semanticColors.js (semantic + finance domain).
 */
import { semanticColors } from '../../../shared/theme/semanticColors.js';

export const FINANCE_THEME = {
  /** Подтверждённые доходы, основной зелёный акцент, прибыль ≥ 0, primary actions */
  primaryGreen: semanticColors.action.primary,
  primaryGreenHover: semanticColors.action.primaryHover,
  /** Ожидаемые доходы */
  lightGreen: semanticColors.finance.incomeExpected,
  /** Расходы, отрицательная прибыль — линии графиков и акценты */
  expenseRed: semanticColors.finance.expense,
  /** Крупные суммы расходов / убыток в сводке (читаемость на светлом фоне) */
  lossRed: semanticColors.finance.loss,
  /** Фон чипа «доход» в таблице */
  incomeChipBg: semanticColors.finance.incomeChipBg,
  incomeChipText: semanticColors.finance.incomeChipText,
  /** Фон чипа «расход» в таблице */
  expenseChipBg: semanticColors.finance.expenseChipBg,
  expenseChipText: semanticColors.finance.expenseChipText,
  /** Hover подписи текущего периода */
  periodNavHoverBg: semanticColors.finance.periodNavHoverBg,
};
