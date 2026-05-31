/**
 * Единая палитра графиков статистики мастера (mobile): bars, stack, legend, line.
 * Legend swatches = MASTER_STATS_BAR_* (один источник правды).
 */

/** Прошлые — нейтральный серый, хорошо читается на белом фоне. */
export const MASTER_STATS_BAR_PAST = '#E5E7EB';
export const MASTER_STATS_BAR_PAST_PENDING = '#F3F4F6';

/** Текущий — однотонный светло-зелёный (bar + stack + legend). */
export const MASTER_STATS_BAR_CURRENT = '#A5D6A7';
export const MASTER_STATS_BAR_CURRENT_PENDING = MASTER_STATS_BAR_CURRENT;

/** Будущие — мягкий голубой, не сизый cornflower. */
export const MASTER_STATS_BAR_FUTURE = '#BFDBFE';
export const MASTER_STATS_BAR_FUTURE_PENDING = '#D7E3F0';

export const MASTER_STATS_LEGEND_PAST = MASTER_STATS_BAR_PAST;
export const MASTER_STATS_LEGEND_CURRENT = MASTER_STATS_BAR_CURRENT;
export const MASTER_STATS_LEGEND_FUTURE = MASTER_STATS_BAR_FUTURE;

/** Линия % — тон темнее fill current, без underlay/glow. */
export const MASTER_STATS_CHANGE_LINE_STROKE = '#388E3C';
export const MASTER_STATS_CHANGE_LINE_DOT_FILL = '#FFFFFF';

export const CHART_GRID_STROKE = '#EEF2F6';
export const CHART_SURFACE_BG = '#ffffff';
export const CHART_SURFACE_BORDER = '#eef2f6';
export const CHART_LEGEND_STRIP_BG = 'transparent';
export const CHART_LEGEND_STRIP_BORDER = 'transparent';

export function masterStatsBarFill(entry: {
  is_current?: boolean;
  is_past?: boolean;
  is_future?: boolean;
}): string {
  if (entry.is_past) return MASTER_STATS_BAR_PAST;
  if (entry.is_current) return MASTER_STATS_BAR_CURRENT;
  if (entry.is_future) return MASTER_STATS_BAR_FUTURE;
  return MASTER_STATS_BAR_FUTURE;
}
