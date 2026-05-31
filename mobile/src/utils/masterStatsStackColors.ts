/**
 * Stacked bar colors — из masterStatsChartTheme (mobile-only).
 */
import {
  MASTER_STATS_BAR_CURRENT,
  MASTER_STATS_BAR_CURRENT_PENDING,
  MASTER_STATS_BAR_FUTURE,
  MASTER_STATS_BAR_FUTURE_PENDING,
  MASTER_STATS_BAR_PAST,
  MASTER_STATS_BAR_PAST_PENDING,
} from '@src/utils/masterStatsChartTheme';

export function masterStackSegmentFills(entry: {
  is_current?: boolean;
  is_past?: boolean;
  is_future?: boolean;
}): { confirmed: string; pending: string } {
  if (entry.is_past) {
    return { confirmed: MASTER_STATS_BAR_PAST, pending: MASTER_STATS_BAR_PAST_PENDING };
  }
  if (entry.is_current) {
    return { confirmed: MASTER_STATS_BAR_CURRENT, pending: MASTER_STATS_BAR_CURRENT_PENDING };
  }
  if (entry.is_future) {
    return { confirmed: MASTER_STATS_BAR_FUTURE, pending: MASTER_STATS_BAR_FUTURE_PENDING };
  }
  return { confirmed: MASTER_STATS_BAR_FUTURE, pending: MASTER_STATS_BAR_FUTURE_PENDING };
}
