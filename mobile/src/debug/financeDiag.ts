/**
 * Временная диагностика finance для release APK (logcat: adb logcat | grep "FINANCE DIAG").
 * После теста: FINANCE_DIAG_ENABLED = false или удалить файл.
 */
export const FINANCE_DIAG_ENABLED = false;

export function logFinanceDiag(message: string, payload?: Record<string, unknown>): void {
  if (!FINANCE_DIAG_ENABLED) return;
  if (payload !== undefined) {
    // eslint-disable-next-line no-console
    console.log(`[FINANCE DIAG] ${message}`, payload);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[FINANCE DIAG] ${message}`);
  }
}

export function logNetProfitChartDiag(message: string, payload?: Record<string, unknown>): void {
  if (!FINANCE_DIAG_ENABLED) return;
  if (payload !== undefined) {
    // eslint-disable-next-line no-console
    console.log(`[NET PROFIT CHART DIAG] ${message}`, payload);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[NET PROFIT CHART DIAG] ${message}`);
  }
}

export function logIncomeExpenseChartDiag(message: string, payload?: Record<string, unknown>): void {
  if (!FINANCE_DIAG_ENABLED) return;
  if (payload !== undefined) {
    // eslint-disable-next-line no-console
    console.log(`[INCOME EXPENSE CHART DIAG] ${message}`, payload);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[INCOME EXPENSE CHART DIAG] ${message}`);
  }
}
