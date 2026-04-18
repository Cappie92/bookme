import type { BarLineChartPoint } from '@src/components/stats/BarLineChart';
import type { DashboardStatsPeriodPoint } from '@src/services/api/master';
import { masterStackSegmentFills } from '@src/utils/masterStatsStackColors';
import { formatStatsAxisLabel } from 'shared/statsPeriodLabels';

/** Point enriched with client-side % change (same shape for dashboard weekly + stats screen). */
export type EnrichedMasterStatsPoint = DashboardStatsPeriodPoint & {
  bookings_change: number;
  income_change: number;
  bookings_change_label: string | null;
  income_change_label: string | null;
  bookings_change_delta: number;
  income_change_delta: number;
};

export function toBookingsBarLinePoint(p: EnrichedMasterStatsPoint): BarLineChartPoint {
  const fills = masterStackSegmentFills(p);
  const bc = p.bookings_confirmed ?? 0;
  const bp = p.bookings_pending ?? 0;
  const bt = p.bookings_total ?? p.bookings ?? 0;
  const hasSplit = typeof p.bookings_confirmed === 'number' || typeof p.bookings_pending === 'number';
  return {
    label: formatStatsAxisLabel(p.period_start, p.period_end, p.period_label),
    bar: bt,
    line: p.bookings_change,
    lineLabel: p.bookings_change_label,
    lineDelta: p.bookings_change_delta,
    is_current: p.is_current,
    is_past: p.is_past,
    is_future: p.is_future,
    period_start: p.period_start,
    period_end: p.period_end,
    barSegments: hasSplit
      ? [
          { key: 'confirmed', value: bc, color: fills.confirmed },
          { key: 'pending', value: bp, color: fills.pending },
        ]
      : undefined,
    tooltipBreakdown: hasSplit ? { confirmed: bc, pending: bp, total: bt } : undefined,
  };
}

export function toIncomeBarLinePoint(p: EnrichedMasterStatsPoint): BarLineChartPoint {
  const fills = masterStackSegmentFills(p);
  const ic = p.income_confirmed_rub ?? 0;
  const ip = p.income_pending_rub ?? 0;
  const it = Math.round(p.income_total_rub ?? p.income ?? 0);
  const hasSplit = typeof p.income_confirmed_rub === 'number' || typeof p.income_pending_rub === 'number';
  return {
    label: formatStatsAxisLabel(p.period_start, p.period_end, p.period_label),
    bar: it,
    line: p.income_change,
    lineLabel: p.income_change_label,
    lineDelta: p.income_change_delta,
    is_current: p.is_current,
    is_past: p.is_past,
    is_future: p.is_future,
    period_start: p.period_start,
    period_end: p.period_end,
    barSegments: hasSplit
      ? [
          { key: 'confirmed', value: ic, color: fills.confirmed },
          { key: 'pending', value: ip, color: fills.pending },
        ]
      : undefined,
    tooltipBreakdown: hasSplit ? { confirmed: ic, pending: ip, total: it } : undefined,
  };
}
