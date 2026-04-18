import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Pressable, ScrollView, Platform, InteractionManager } from 'react-native';
import { formatStatsBucketRange, normalizeLegacyPeriodLabel } from 'shared/statsPeriodLabels';
import {
  CHART_GRID_STROKE,
  CHART_LEGEND_STRIP_BG,
  CHART_LEGEND_STRIP_BORDER,
  CHART_SURFACE_BG,
  CHART_SURFACE_BORDER,
  MASTER_STATS_CHANGE_LINE_DOT,
  MASTER_STATS_CHANGE_LINE_STROKE,
  MASTER_STATS_LEGEND_CURRENT,
  MASTER_STATS_LEGEND_FUTURE,
  MASTER_STATS_LEGEND_PAST,
} from '@src/utils/masterStatsChartTheme';

/** Мин. ширина контента на точку — плотный ритм bucket’ов. */
const ITEM_W = 42;
const LINE_STROKE_W = 1.25;
const DOT_R = 2;
const DOT_R_ACTIVE = 3;
const BAR_TOP_RADIUS = 4;
/** Уже столбец → больше воздуха между колонками (агрессивнее vs web density). */
const BAR_WIDTH_FRAC = 0.34;
const BAR_WIDTH_MIN = 5;
const BAR_WIDTH_MAX = 28;

/** Bottom → top: confirmed, then pending (same stack order as web Recharts). */
export type BarStackSegmentKey = 'confirmed' | 'pending';

export interface BarStackSegment {
  key: BarStackSegmentKey;
  value: number;
  color: string;
}

export interface BarLineChartTooltipBreakdown {
  confirmed: number;
  pending: number;
  total: number;
}

export interface BarLineChartPoint {
  label: string;
  /** Total bar height scale (same as web `*_total` / legacy). */
  bar: number;
  line: number; // percent for positioning, can be negative
  lineLabel?: string | null; // when percent undefined (e.g. "рост от нулевой базы"), show this in tooltip
  lineDelta?: number; // absolute delta when lineLabel (e.g. +3)
  is_current?: boolean;
  is_past?: boolean;
  is_future?: boolean;
  period_start?: string; // YYYY-MM-DD for onBarSelect in day mode
  period_end?: string;
  /** Optional stacked columns (confirmed + pending); omit for legacy single-bar points. */
  barSegments?: BarStackSegment[];
  /** When set, tooltip shows Подтверждённые / Ожидающие / Всего under the main value. */
  tooltipBreakdown?: BarLineChartTooltipBreakdown;
}

interface BarLineChartProps {
  title: string;
  data: BarLineChartPoint[];
  barValueSuffix?: string; // for tooltip (fallback)
  formatBarValue?: (value: number) => string;
  barColor?: (p: BarLineChartPoint) => string;
  lineColor?: string;
  onBarSelect?: (index: number, periodStart?: string) => void;
  /** For day mode: initial selected index (anchor day) from API */
  initialSelectedIndex?: number | null;
  /** Уменьшенная высота для встраивания в карточку «Период» на mobile */
  compact?: boolean;
  /** Легенда периодов (как на web под графиком) */
  showLegend?: boolean;
}

export const CHART_COLORS = {
  /** Согласовано с current stack (legacy single-bar). */
  current: '#2e7d32',
  /** Legacy single-bar: past заметно тише. */
  past: '#d1dae6',
  future: 'rgba(100,149,237,0.38)',
  /** Линия % изменения — паритет с web Recharts stroke */
  line: MASTER_STATS_CHANGE_LINE_STROKE,
  bg: CHART_SURFACE_BG,
  border: CHART_SURFACE_BORDER,
} as const;

const DEFAULT_LINE_COLOR = CHART_COLORS.line;
/** Вертикаль: больше площади plot, меньше «пустого» верха (см. PLOT_PADDING_TOP). */
const DEFAULT_CHART_HEIGHT = 248;
const DEFAULT_PLOT_HEIGHT = 216;
const PLOT_PADDING_TOP = 2;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function BarLineChart({
  title,
  data,
  barValueSuffix = '',
  formatBarValue,
  barColor,
  lineColor = DEFAULT_LINE_COLOR,
  onBarSelect,
  initialSelectedIndex,
  compact = false,
  showLegend = true,
}: BarLineChartProps) {
  const chartHeight = compact ? 162 : DEFAULT_CHART_HEIGHT;
  const plotHeight = compact ? 126 : DEFAULT_PLOT_HEIGHT;
  const labelsHeight = Math.max(24, chartHeight - plotHeight - PLOT_PADDING_TOP);

  const [layout, setLayout] = useState<{ w: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const lastScrolledIndexRef = useRef<number | null>(null);
  const scrollFromTapRef = useRef(false);

  useEffect(() => {
    if (
      data.length > 0 &&
      initialSelectedIndex != null &&
      initialSelectedIndex >= 0 &&
      initialSelectedIndex < data.length
    ) {
      lastScrolledIndexRef.current = null; // сброс при новом anchor/data
      setSelectedIndex(initialSelectedIndex);
    }
  }, [data.length, initialSelectedIndex]);

  const handleBarPress = (index: number) => {
    const idx = Number(index);
    if (__DEV__) {
      console.log('[BarLineChart] handleBarPress', { index: idx, label: data[idx]?.label });
    }
    scrollFromTapRef.current = true;
    setSelectedIndex((cur) => (cur === idx ? null : idx));
    const point = data[idx];
    onBarSelect?.(idx, point?.period_start);
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setLayout({ w: width });
  };

  const colors = useMemo(() => {
    const defaultBarColor = (p: BarLineChartPoint) => {
      if (p.is_current) return CHART_COLORS.current;
      if (p.is_future) return CHART_COLORS.future;
      return CHART_COLORS.past;
    };
    return {
      bar: barColor ?? defaultBarColor,
      line: lineColor,
    };
  }, [barColor, lineColor]);

  const maxBar = useMemo(() => {
    const m = Math.max(...data.map((d) => d.bar || 0), 0);
    return m <= 0 ? 1 : m;
  }, [data]);

  const lineRange = useMemo(() => {
    const vals = data.map((d) => d.line || 0);
    let min = Math.min(...vals, 0);
    let max = Math.max(...vals, 0);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    return { min, max };
  }, [data]);

  const chartContentWidth = useMemo(() => {
    if (!layout || data.length === 0) return layout?.w ?? 0;
    return Math.max(layout.w, data.length * ITEM_W);
  }, [layout, data.length]);

  const points = useMemo(() => {
    if (!layout || data.length === 0) return [];
    const w = chartContentWidth;
    const chartH = Math.max(1, plotHeight);
    const n = data.length;
    const step = w / n;
    const barWidth = clamp(step * BAR_WIDTH_FRAC, BAR_WIDTH_MIN, BAR_WIDTH_MAX);

    const yBar = (bar: number) => {
      const v = (bar || 0) / maxBar;
      return PLOT_PADDING_TOP + chartH - chartH * clamp(v, 0, 1);
    };
    const yLine = (line: number) => {
      const { min, max } = lineRange;
      const t = (line - min) / (max - min);
      return PLOT_PADDING_TOP + chartH - chartH * clamp(t, 0, 1);
    };

    return data.map((d, i) => {
      const cx = step * i + step / 2;
      const xBarLeft = cx - barWidth / 2;
      const yLinePos = yLine(d.line || 0);
      const yBarTop = yBar(d.bar || 0);
      return {
        i,
        cx,
        xBarLeft,
        barWidth,
        yBarTop,
        yLine: yLinePos,
        step,
      };
    });
  }, [layout, data, maxBar, lineRange, chartContentWidth, plotHeight]);

  const lineSegments = useMemo(() => {
    if (points.length < 2) return [];
    const segs: Array<{ key: string; left: number; top: number; width: number; rotate: string }> = [];
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const dx = p2.cx - p1.cx;
      const dy = p2.yLine - p1.yLine;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const centerX = (p1.cx + p2.cx) / 2;
      const centerY = (p1.yLine + p2.yLine) / 2;
      segs.push({
        key: `seg-${i}`,
        left: centerX - dist / 2,
        top: centerY - LINE_STROKE_W / 2,
        width: dist,
        rotate: `${angle}rad`,
      });
    }
    return segs;
  }, [points]);

  const selected = selectedIndex !== null ? data[selectedIndex] : null;
  const tooltipPeriodTitle = selected
    ? formatStatsBucketRange(selected.period_start, selected.period_end) ||
      normalizeLegacyPeriodLabel(selected.label)
    : '';
  const formatBreakdownValue = formatBarValue ?? ((v: number) => `${v} ${barValueSuffix}`.trim());

  const selectedBarText = selected
    ? formatBarValue
      ? formatBarValue(selected.bar)
      : `${selected.bar} ${barValueSuffix}`.trim()
    : '';

  const needsScroll = chartContentWidth > (layout?.w ?? 0) && data.length > 5;
  const hitZoneWidth = Math.max(ITEM_W, chartContentWidth / data.length);
  const step = data.length > 0 ? chartContentWidth / data.length : ITEM_W;

  // Auto-scroll: init = instant, tap = animated
  useEffect(() => {
    if (
      !needsScroll ||
      selectedIndex == null ||
      selectedIndex < 0 ||
      selectedIndex >= data.length ||
      !layout
    ) {
      return;
    }
    const idx = Number(selectedIndex);
    if (lastScrolledIndexRef.current === idx) {
      scrollFromTapRef.current = false;
      return; // уже прокручено к этому индексу
    }
    lastScrolledIndexRef.current = idx;
    const viewportW = layout.w;
    const barCenterX = idx * step + step / 2;
    const scrollX = Math.max(0, Math.min(barCenterX - viewportW / 2, chartContentWidth - viewportW));
    const fromTap = scrollFromTapRef.current;
    scrollFromTapRef.current = false;

    const doScroll = (animated: boolean) => {
      scrollRef.current?.scrollTo({ x: scrollX, animated });
    };

    if (fromTap) {
      InteractionManager.runAfterInteractions(() => {
        doScroll(true);
      });
    } else {
      const t = setTimeout(() => doScroll(false), 0);
      return () => clearTimeout(t);
    }
  }, [needsScroll, selectedIndex, layout?.w, chartContentWidth, data.length, step]);

  const chartContent = (
    <View style={[styles.chartContentWrap, { width: chartContentWidth }]} pointerEvents="box-none">
          <View style={[styles.plotArea, { width: chartContentWidth, height: plotHeight + PLOT_PADDING_TOP }]}>
            {layout &&
              [0.2, 0.4, 0.6, 0.8].map((frac, gi) => (
                <View
                  key={`grid-${gi}`}
                  style={[
                    styles.gridLine,
                    {
                      top: PLOT_PADDING_TOP + plotHeight * frac,
                      left: 4,
                      right: 4,
                    },
                  ]}
                  pointerEvents="none"
                />
              ))}
            {/* tappable zones — поверх всего, pointerEvents по умолчанию */}
            {layout &&
              points.map((p) => (
                <Pressable
                  key={`hit-${p.i}`}
                  onPress={() => handleBarPress(p.i)}
                  delayPressIn={0}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                  style={[styles.hitZone, { left: p.step * p.i, width: hitZoneWidth }]}
                />
              ))}

          {/* line segments */}
          {layout &&
            lineSegments.map((s) => (
              <View
                key={s.key}
                style={[
                  styles.lineSeg,
                  {
                    left: s.left,
                    top: s.top,
                    width: s.width,
                    height: LINE_STROKE_W,
                    backgroundColor: colors.line,
                    opacity: 0.68,
                    transform: [{ rotateZ: s.rotate }],
                  },
                ]}
                pointerEvents="none"
              />
            ))}

          {/* bars — single column OR stacked confirmed+pending */}
          {layout &&
            points.map((p) => {
              const d = data[p.i];
              const barH = Math.max(0, PLOT_PADDING_TOP + plotHeight - p.yBarTop);
              const isSelected = selectedIndex != null && Number(selectedIndex) === Number(p.i);
              const segs = d.barSegments;
              const useStack =
                Array.isArray(segs) &&
                segs.length >= 2 &&
                (d.bar ?? 0) > 0 &&
                segs[0]?.key === 'confirmed' &&
                segs[1]?.key === 'pending';

              if (useStack && segs) {
                const total = d.bar;
                const cVal = Math.max(0, segs[0].value);
                const pVal = Math.max(0, segs[1].value);
                const hC = total > 0 ? barH * (cVal / total) : 0;
                const hP = total > 0 ? barH * (pVal / total) : 0;
                const isPast = d.is_past === true;
                const isCurrentBucket = d.is_current === true;
                const stackOpacity = isSelected ? 1 : isPast ? 0.62 : isCurrentBucket ? 1 : 0.86;
                const hairlineTop =
                  hC > 0 && hP > 0
                    ? isCurrentBucket
                      ? 'rgba(255,255,255,0.82)'
                      : 'rgba(255,255,255,0.38)'
                    : 'transparent';
                const ringW = isSelected ? 1 : isCurrentBucket ? StyleSheet.hairlineWidth : 0;
                const ringCol = isSelected
                  ? 'rgba(46,125,50,0.48)'
                  : isCurrentBucket
                    ? 'rgba(46,125,50,0.28)'
                    : 'transparent';
                return (
                  <View
                    key={`bar-stack-${p.i}`}
                    style={[
                      styles.barStackWrap,
                      {
                        left: p.xBarLeft,
                        width: p.barWidth,
                        height: Math.max(barH, isSelected ? 4 : 0),
                        borderWidth: ringW,
                        borderColor: ringCol,
                        opacity: stackOpacity,
                      },
                    ]}
                    pointerEvents="none"
                  >
                    {hC > 0 ? (
                      <View
                        style={[
                          styles.barStackSeg,
                          {
                            height: hC,
                            backgroundColor: segs[0].color,
                            bottom: 0,
                            borderTopLeftRadius: hP > 0 ? 0 : BAR_TOP_RADIUS,
                            borderTopRightRadius: hP > 0 ? 0 : BAR_TOP_RADIUS,
                            borderBottomWidth: hP > 0 ? StyleSheet.hairlineWidth : 0,
                            borderBottomColor: hP > 0 ? 'rgba(0,0,0,0.07)' : 'transparent',
                          },
                        ]}
                      />
                    ) : null}
                    {hP > 0 ? (
                      <View
                        style={[
                          styles.barStackSeg,
                          {
                            height: hP,
                            backgroundColor: segs[1].color,
                            bottom: hC,
                            borderTopLeftRadius: BAR_TOP_RADIUS,
                            borderTopRightRadius: BAR_TOP_RADIUS,
                            borderTopWidth: hC > 0 ? StyleSheet.hairlineWidth : 0,
                            borderTopColor: hairlineTop,
                          },
                        ]}
                      />
                    ) : null}
                  </View>
                );
              }

              const solidBarColor = isSelected ? CHART_COLORS.current : colors.bar(d);
              const legacyOpacity = isSelected ? 1 : d.is_past === true ? 0.62 : d.is_current === true ? 1 : 0.86;
              return (
                <View
                  key={`bar-${p.i}`}
                  style={[
                    styles.bar,
                    {
                      left: p.xBarLeft,
                      width: p.barWidth,
                      height: Math.max(barH, isSelected ? 4 : 0),
                      backgroundColor: solidBarColor,
                      opacity: legacyOpacity,
                      borderWidth: isSelected ? 1 : 0,
                      borderColor: isSelected ? 'rgba(76,175,80,0.36)' : 'transparent',
                    },
                  ]}
                  pointerEvents="none"
                />
              );
            })}

          {/* Линия % — плоские точки без halo, максимально спокойно */}
          {layout &&
            points.map((p) => {
              const isDotActive = selectedIndex !== null && p.i === selectedIndex;
              const r = isDotActive ? DOT_R_ACTIVE : DOT_R;
              return (
                <View
                  key={`dot-${p.i}`}
                  style={[
                    styles.dot,
                    {
                      left: p.cx - r / 2,
                      top: p.yLine - r / 2,
                      width: r,
                      height: r,
                      borderRadius: r / 2,
                      backgroundColor: MASTER_STATS_CHANGE_LINE_DOT,
                      borderWidth: 1,
                      borderColor: '#ffffff',
                      opacity: isDotActive ? 1 : 0.88,
                    },
                  ]}
                  pointerEvents="none"
                />
              );
            })}
          </View>

          {/* x labels — при >10 точек показываем каждый 2й для читаемости */}
          <View style={[styles.labelsRow, { width: chartContentWidth, height: labelsHeight }]} pointerEvents="none">
            {layout &&
              data.map((d, i) => {
                const showLabel = data.length <= 10 || i % 2 === 0;
                return (
                  <View key={`lab-${i}`} style={[styles.labelCell, { width: chartContentWidth / data.length }]}>
                    <Text style={styles.xLabel} numberOfLines={1}>
                      {showLabel ? d.label : ''}
                    </Text>
                  </View>
                );
              })}
          </View>
        </View>
  );

  return (
    <View collapsable={false} pointerEvents="box-none">
      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      <View style={[styles.chart, compact && styles.chartCompact, needsScroll && styles.chartScrollable]} onLayout={onLayout}>
        {needsScroll ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            scrollEnabled
            showsHorizontalScrollIndicator
            contentContainerStyle={{ width: chartContentWidth, minWidth: chartContentWidth }}
            // Android: nested scroll с вертикальным родителем (RN: вложенный горизонтальный scroll).
            // iOS: проп игнорируется движком — безопасно держать true для единого контракта.
            nestedScrollEnabled
            // iOS: после старта жеста фиксируем ось — реже «съедает» вертикальный родительский ScrollView.
            directionalLockEnabled={Platform.OS === 'ios'}
            bounces={true}
            alwaysBounceHorizontal={data.length > 5}
          >
            {chartContent}
          </ScrollView>
        ) : (
          chartContent
        )}
      </View>

      {showLegend ? (
        <View style={[styles.legendStrip, compact && styles.legendStripCompact]} pointerEvents="none">
          <View style={[styles.legendRow, compact && styles.legendRowCompact]}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: MASTER_STATS_LEGEND_CURRENT }]} />
              <Text style={[styles.legendLabel, compact && styles.legendLabelCompact]}>Сейчас</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: MASTER_STATS_LEGEND_PAST }]} />
              <Text style={[styles.legendLabel, compact && styles.legendLabelCompact]}>Прошлые</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: MASTER_STATS_LEGEND_FUTURE }]} />
              <Text style={[styles.legendLabel, compact && styles.legendLabelCompact]}>Будущие</Text>
            </View>
          </View>
        </View>
      ) : null}

      {selected && (
        <View style={[styles.tooltip, compact && styles.tooltipCompact]}>
          <Text style={styles.tooltipTitle}>{tooltipPeriodTitle}</Text>
          <View style={styles.tooltipDivider} />
          <Text style={styles.tooltipSectionHint}>По выбранному периоду</Text>
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipLabel}>Значение</Text>
            <Text style={styles.tooltipValue}>{selectedBarText}</Text>
          </View>
          {selected.tooltipBreakdown ? (
            <>
              <View style={styles.tooltipDividerLight} />
              <Text style={styles.tooltipSectionHint}>Разбивка</Text>
              <View style={styles.tooltipRow}>
                <Text style={styles.tooltipLabel}>Подтверждённые</Text>
                <Text style={styles.tooltipValue}>{formatBreakdownValue(selected.tooltipBreakdown.confirmed)}</Text>
              </View>
              <View style={styles.tooltipRow}>
                <Text style={styles.tooltipLabel}>Ожидающие</Text>
                <Text style={styles.tooltipValue}>{formatBreakdownValue(selected.tooltipBreakdown.pending)}</Text>
              </View>
              <View style={styles.tooltipRow}>
                <Text style={styles.tooltipLabel}>Всего</Text>
                <Text style={styles.tooltipValueEm}>{formatBreakdownValue(selected.tooltipBreakdown.total)}</Text>
              </View>
            </>
          ) : null}
          <View style={styles.tooltipDividerLight} />
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipLabel}>Изменение</Text>
            <Text style={[styles.tooltipValue, (selected.lineLabel ? styles.neutral : (selected.line >= 0 ? styles.pos : styles.neutral))]}>
              {selected.lineLabel ? (
                <>
                  {selected.lineLabel}
                  {selected.lineDelta != null && selected.lineDelta !== 0 && (
                    <> · {(selected.lineDelta > 0 ? '+' : '')}{selected.lineDelta}</>
                  )}
                </>
              ) : (
                <>{(selected.line > 0 ? '+' : '')}{Math.round(selected.line)}%</>
              )}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
    letterSpacing: -0.25,
  },
  titleCompact: {
    fontSize: 12,
    marginBottom: 3,
    letterSpacing: -0.15,
  },
  chart: {
    backgroundColor: CHART_COLORS.bg,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 5,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CHART_COLORS.border,
  },
  chartCompact: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chartScrollable: {
    overflow: 'hidden',
  },
  chartContentWrap: {
    flexDirection: 'column',
  },
  plotArea: {
    position: 'relative',
    width: '100%',
  },
  gridLine: {
    position: 'absolute',
    height: StyleSheet.hairlineWidth,
    backgroundColor: CHART_GRID_STROKE,
    opacity: 0.55,
  },
  hitZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  bar: {
    position: 'absolute',
    bottom: 0,
    borderTopLeftRadius: BAR_TOP_RADIUS,
    borderTopRightRadius: BAR_TOP_RADIUS,
  },
  barStackWrap: {
    position: 'absolute',
    bottom: 0,
    borderRadius: BAR_TOP_RADIUS,
    overflow: 'hidden',
  },
  barStackSeg: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  xLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#94a3b8',
    maxWidth: '100%',
    textAlign: 'center',
    lineHeight: 14,
    letterSpacing: -0.05,
  },
  labelsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 2,
    paddingTop: 0,
  },
  labelCell: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  dot: {
    position: 'absolute',
  },
  lineSeg: {
    position: 'absolute',
  },
  legendStrip: {
    marginTop: 3,
    alignSelf: 'stretch',
    backgroundColor: CHART_LEGEND_STRIP_BG,
    borderRadius: 6,
    borderWidth: 0,
    borderColor: CHART_LEGEND_STRIP_BORDER,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  legendStripCompact: {
    marginTop: 2,
    paddingVertical: 1,
    paddingHorizontal: 2,
    borderRadius: 4,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  legendRowCompact: {
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  legendSwatch: {
    width: 6,
    height: 6,
    borderRadius: 1,
  },
  legendLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: '#94a3b8',
    letterSpacing: 0,
    opacity: 0.92,
  },
  legendLabelCompact: {
    fontSize: 10,
  },
  tooltip: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8eaef',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
        }
      : { elevation: 3 }),
  },
  tooltipCompact: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
  },
  tooltipTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 0,
    letterSpacing: -0.28,
  },
  tooltipDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },
  tooltipDividerLight: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#f3f4f6',
    marginVertical: 6,
  },
  tooltipSectionHint: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.55,
    marginBottom: 4,
  },
  tooltipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  tooltipLabel: {
    fontSize: 13,
    color: '#6b7280',
    flexShrink: 0,
  },
  tooltipValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'right',
  },
  tooltipValueEm: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    textAlign: 'right',
  },
  pos: { color: MASTER_STATS_CHANGE_LINE_STROKE },
  neutral: { color: '#666' },
});

