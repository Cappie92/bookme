/**
 * Единая палитра экрана «Финансы» (mobile). Android/iOS — один файл.
 * Источник значений — shared/theme/semanticColors.js.
 */
import { semanticColors } from 'shared/theme/semanticColors';

export const FINANCE_THEME = {
  primaryGreen: semanticColors.action.primary,
  primaryGreenHover: semanticColors.action.primaryHover,
  lightGreen: semanticColors.finance.incomeExpected,
  expenseRed: semanticColors.finance.expense,
  lossRed: semanticColors.finance.loss,
  mutedGreenBg: semanticColors.finance.incomeChipBg,
  periodSurfaceBg: semanticColors.finance.periodSurfaceBg,
  white: semanticColors.surface.card,
} as const;
