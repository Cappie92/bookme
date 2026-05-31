import {
  MASTER_STATS_BAR_CURRENT,
  MASTER_STATS_BAR_CURRENT_PENDING,
  MASTER_STATS_BAR_FUTURE,
  MASTER_STATS_BAR_FUTURE_PENDING,
  MASTER_STATS_BAR_PAST,
  MASTER_STATS_BAR_PAST_PENDING,
  MASTER_STATS_CHANGE_LINE_STROKE,
  MASTER_STATS_LEGEND_CURRENT,
  MASTER_STATS_LEGEND_FUTURE,
  MASTER_STATS_LEGEND_PAST,
  masterStatsBarFill,
} from '@src/utils/masterStatsChartTheme';
import { masterStackSegmentFills } from '@src/utils/masterStatsStackColors';

describe('masterStatsChartTheme palette', () => {
  it('legend swatches match primary bar colors', () => {
    expect(MASTER_STATS_LEGEND_PAST).toBe(MASTER_STATS_BAR_PAST);
    expect(MASTER_STATS_LEGEND_CURRENT).toBe(MASTER_STATS_BAR_CURRENT);
    expect(MASTER_STATS_LEGEND_FUTURE).toBe(MASTER_STATS_BAR_FUTURE);
  });

  it('past is neutral grey, not blue-grey', () => {
    expect(MASTER_STATS_BAR_PAST).toBe('#E5E7EB');
    expect(MASTER_STATS_BAR_PAST).not.toMatch(/cbd5e1|94a3b8/i);
  });

  it('future is soft sky blue hex', () => {
    expect(MASTER_STATS_BAR_FUTURE).toBe('#BFDBFE');
    expect(MASTER_STATS_BAR_FUTURE).toMatch(/^#/);
  });

  it('masterStatsBarFill maps period flags', () => {
    expect(masterStatsBarFill({ is_past: true })).toBe(MASTER_STATS_BAR_PAST);
    expect(masterStatsBarFill({ is_current: true })).toBe(MASTER_STATS_BAR_CURRENT);
    expect(masterStatsBarFill({ is_future: true })).toBe(MASTER_STATS_BAR_FUTURE);
  });

  it('current bar and legend use same light green', () => {
    expect(MASTER_STATS_BAR_CURRENT).toBe('#A5D6A7');
    expect(MASTER_STATS_LEGEND_CURRENT).toBe(MASTER_STATS_BAR_CURRENT);
  });

  it('line stroke is darker green for contrast on current bar', () => {
    expect(MASTER_STATS_CHANGE_LINE_STROKE).toBe('#388E3C');
  });
});

describe('masterStackSegmentFills', () => {
  it('uses theme stack colors for each period', () => {
    expect(masterStackSegmentFills({ is_past: true })).toEqual({
      confirmed: MASTER_STATS_BAR_PAST,
      pending: MASTER_STATS_BAR_PAST_PENDING,
    });
    expect(masterStackSegmentFills({ is_current: true })).toEqual({
      confirmed: MASTER_STATS_BAR_CURRENT,
      pending: MASTER_STATS_BAR_CURRENT_PENDING,
    });
    expect(masterStackSegmentFills({ is_future: true })).toEqual({
      confirmed: MASTER_STATS_BAR_FUTURE,
      pending: MASTER_STATS_BAR_FUTURE_PENDING,
    });
  });

  it('current stack segments share one fill (no two-tone bar)', () => {
    const fills = masterStackSegmentFills({ is_current: true });
    expect(fills.confirmed).toBe(fills.pending);
    expect(fills.confirmed).toBe('#A5D6A7');
  });

  it('future pending is soft blue not grey-blue', () => {
    expect(MASTER_STATS_BAR_FUTURE_PENDING).toBe('#D7E3F0');
  });
});
