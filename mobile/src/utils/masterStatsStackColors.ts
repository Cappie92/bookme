/**
 * Stacked bar colors for master dashboard/stats — mobile-only tuning (web uses inline fills).
 */
export function masterStackSegmentFills(entry: {
  is_current?: boolean;
  is_past?: boolean;
  is_future?: boolean;
}): { confirmed: string; pending: string } {
  if (entry.is_past) {
    /* Сильно тише фон: past на втором плане, почти «воздух». */
    return { confirmed: '#cbd5e1', pending: '#f1f5f9' };
  }
  if (entry.is_current) {
    /* Текущий период — явный якорь + читаемый pending. */
    return { confirmed: '#2e7d32', pending: '#5dade2' };
  }
  return { confirmed: '#1e88e5', pending: '#a5d6fa' };
}
