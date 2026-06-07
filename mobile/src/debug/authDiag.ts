/**
 * Временная диагностика auth для release APK (logcat: adb logcat | grep "AUTH DIAG").
 * После теста: AUTH_DIAG_ENABLED = false или удалить файл.
 */
export const AUTH_DIAG_ENABLED = false;

export function logAuthDiag(message: string, payload?: Record<string, unknown>): void {
  if (!AUTH_DIAG_ENABLED) return;
  if (payload !== undefined) {
    // eslint-disable-next-line no-console
    console.log(`[AUTH DIAG] ${message}`, payload);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[AUTH DIAG] ${message}`);
  }
}
