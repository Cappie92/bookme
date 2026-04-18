import { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, ScrollView, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { Card } from '@src/components/Card';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { getDashboardStats, getMasterExtendedStats, DashboardStats, MasterExtendedStats, StatsPeriod } from '@src/services/api/master';
import { formatMoney } from '@src/utils/money';
import { useMasterFeatures } from '@src/hooks/useMasterFeatures';
import { DemoAccessBanner } from '@src/components/DemoAccessBanner';
import { getCheapestPlanForFeature } from '@src/utils/featureAccess';
import { statsDemo } from '@src/shared/demo';
import { router } from 'expo-router';
import { BarLineChart } from '@src/components/stats/BarLineChart';
import { SegmentedControl } from '@src/components/SegmentedControl';
import { calcChange } from '@src/utils/statsChange';
import {
  EnrichedMasterStatsPoint,
  toBookingsBarLinePoint,
  toIncomeBarLinePoint,
} from '@src/utils/masterDashboardChartPoints';
import { logger } from '@src/utils/logger';

const RU_MONTHS_FULL = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

function toRuDateShort(date: Date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

function toRuDayMonth(date: Date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(base: Date, months: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function startOfWeekMonday(base: Date) {
  const d = new Date(base);
  const day = d.getDay(); // 0=Sun...6=Sat
  const shift = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + shift);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getCurrentPeriodLabel(period: StatsPeriod, offset: number, dayAnchorDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (period === 'day') {
    const day = new Date(dayAnchorDate);
    if (Number.isNaN(day.getTime())) return toRuDateShort(today);
    return toRuDateShort(day);
  }

  if (period === 'week') {
    const currentWeekStart = startOfWeekMonday(today);
    const targetWeekStart = addDays(currentWeekStart, offset * 7);
    const targetWeekEnd = addDays(targetWeekStart, 6);
    return `${toRuDayMonth(targetWeekStart)}–${toRuDayMonth(targetWeekEnd)}`;
  }

  if (period === 'month') {
    const target = addMonths(today, offset);
    return offset === 0 ? RU_MONTHS_FULL[target.getMonth()] : `${RU_MONTHS_FULL[target.getMonth()]} ${target.getFullYear()}`;
  }

  if (period === 'quarter') {
    const shifted = addMonths(today, offset * 3);
    const quarter = Math.floor(shifted.getMonth() / 3) + 1;
    const yy = String(shifted.getFullYear()).slice(-2);
    return `Q${quarter} ${yy}`;
  }

  const targetYear = today.getFullYear() + offset;
  return String(targetYear);
}

function getResetPeriodLabel(period: StatsPeriod) {
  if (period === 'day') return 'Сегодня';
  if (period === 'week') return 'Эта неделя';
  if (period === 'month') return 'Этот месяц';
  if (period === 'quarter') return 'Этот квартал';
  return 'Этот год';
}

function EmptyState({
  title = 'Нет данных за период',
  subtitle = 'Попробуйте выбрать другой период',
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  );
}

export default function MasterStatsScreen() {
  const { features, loading: featuresLoading, source, refresh } = useMasterFeatures();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriod>('week');
  const [timeOffset, setTimeOffset] = useState(0);
  const [dayAnchorDate, setDayAnchorDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [showExtended, setShowExtended] = useState(false);
  /** Паритет с desktop: одна колонка графика + переключатель метрики */
  const [chartMetric, setChartMetric] = useState<'bookings' | 'income'>('bookings');
  const [extendedStats, setExtendedStats] = useState<MasterExtendedStats | null>(null);
  const [extendedLoading, setExtendedLoading] = useState(false);
  const [extendedError, setExtendedError] = useState<string | null>(null);
  const [extendedForbidden, setExtendedForbidden] = useState(false);

  const isPro = features?.has_extended_stats === true;
  const hasExtendedStats = isPro;

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (__DEV__ && (features || !featuresLoading)) {
      logger.debug('dashboard', '[STATS] isPro', {
        isPro,
        source: source ?? 'none',
        plan_name: features?.plan_name,
        plan_id: features?.plan_id,
        has_extended_stats: features?.has_extended_stats,
      });
    }
  }, [features, featuresLoading, source, isPro]);

  const formatRubles = useCallback((value: number) => {
    const v = Math.round(value || 0);
    return `${v.toLocaleString('ru-RU')} ₽`;
  }, []);


  const loadBaseStats = useCallback(async () => {
    if (!hasExtendedStats) return;
    try {
      setError(null);
      const params =
        selectedPeriod === 'day'
          ? { anchor_date: dayAnchorDate, window_before: 9, window_after: 9 }
          : undefined;
      const data = await getDashboardStats(selectedPeriod, timeOffset, params);
      setStats(data);
    } catch (err: any) {
      setError(err?.message || 'Ошибка загрузки статистики');
      // Важно: как в web — не ломаем экран, просто показываем нули
      setStats((prev) =>
        prev ?? {
          current_week_bookings: 0,
          previous_week_bookings: 0,
          current_week_income: 0,
          previous_week_income: 0,
          weeks_data: [],
          top_services_by_bookings: [],
          top_services_by_earnings: [],
          top_period_range: '',
        }
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPeriod, timeOffset, dayAnchorDate, hasExtendedStats]);

  const loadExtended = useCallback(async () => {
    if (!showExtended) return;
    if (!hasExtendedStats) return;

    try {
      setExtendedError(null);
      setExtendedForbidden(false);
      setExtendedLoading(true);
      const data = await getMasterExtendedStats(selectedPeriod, true, {
        offset: timeOffset,
        ...(selectedPeriod === 'day'
          ? { anchor_date: dayAnchorDate, window_before: 9, window_after: 9 }
          : {}),
      });
      setExtendedStats(data);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) {
        setExtendedForbidden(true);
        setExtendedStats(null);
        return;
      }
      setExtendedError(err?.message || 'Не удалось загрузить расширенную статистику');
      // как в web: мягко деградируем в нули
      setExtendedStats((prev) =>
        prev ?? {
          period: selectedPeriod,
          current_period: {
            start_date: '',
            end_date: '',
            factual: { revenue: 0, bookings_count: 0 },
            plan: { revenue: 0, bookings_count: 0 },
            upcoming: { revenue: 0, bookings_count: 0 },
            period_total: { revenue: 0, bookings_count: 0 },
          },
          previous_period: {
            start_date: null,
            end_date: null,
            factual: null,
            upcoming: null,
            period_total: null,
          },
          comparison: {
            revenue_change_percent: 0,
            bookings_change_percent: 0,
            revenue_change_amount: 0,
            bookings_change_amount: 0,
          },
          forecast: { predicted_revenue: 0, predicted_bookings: 0, confidence: 'period_total' },
        }
      );
    } finally {
      setExtendedLoading(false);
    }
  }, [showExtended, hasExtendedStats, selectedPeriod, timeOffset, dayAnchorDate]);

  useEffect(() => {
    loadBaseStats();
  }, [loadBaseStats]);

  useEffect(() => {
    loadExtended();
  }, [loadExtended]);

  const handleRefresh = () => {
    setRefreshing(true);
    setLoading(true);
    loadBaseStats();
    if (showExtended && hasExtendedStats) {
      loadExtended();
    }
  };

  const periods: Array<{ key: StatsPeriod; label: string }> = useMemo(
    () => [
      { key: 'day', label: 'День' },
      { key: 'week', label: 'Неделя' },
      { key: 'month', label: 'Месяц' },
      { key: 'quarter', label: 'Квартал' },
      { key: 'year', label: 'Год' },
    ],
    []
  );

  const currentPeriodLabel = useMemo(
    () => getCurrentPeriodLabel(selectedPeriod, timeOffset, dayAnchorDate),
    [selectedPeriod, timeOffset, dayAnchorDate]
  );
  const resetPeriodLabel = useMemo(() => getResetPeriodLabel(selectedPeriod), [selectedPeriod]);

  const chartData = useMemo((): EnrichedMasterStatsPoint[] => {
    const weeks = stats?.weeks_data || [];
    return weeks.map((p, index) => {
      const prev = index > 0 ? weeks[index - 1] : null;
      const prevB = prev?.bookings_total ?? prev?.bookings ?? 0;
      const prevI = prev?.income_total_rub ?? prev?.income ?? 0;
      const curB = p.bookings_total ?? p.bookings ?? 0;
      const curI = p.income_total_rub ?? p.income ?? 0;
      const bChange = calcChange(curB, prevB);
      const iChange = calcChange(curI, prevI);
      return {
        ...p,
        bookings_change: bChange.percent ?? 0,
        income_change: iChange.percent ?? 0,
        bookings_change_label: bChange.label,
        income_change_label: iChange.label,
        bookings_change_delta: bChange.absoluteDelta,
        income_change_delta: iChange.absoluteDelta,
      };
    });
  }, [stats]);

  const bookingsBarData = useMemo(() => chartData.map(toBookingsBarLinePoint), [chartData]);

  const incomeBarData = useMemo(() => chartData.map(toIncomeBarLinePoint), [chartData]);

  const baseKpi = useMemo(() => {
    const cwB = stats?.current_week_bookings || 0;
    const pwB = stats?.previous_week_bookings || 0;
    const cwI = stats?.current_week_income || 0;
    const pwI = stats?.previous_week_income || 0;
    return {
      bookings: calcChange(cwB, pwB),
      income: calcChange(cwI, pwI),
      bookingsCurrent: cwB,
      bookingsPrevious: pwB,
      incomeCurrent: cwI,
      incomePrevious: pwI,
    };
  }, [stats]);

  // Разделяем 2 состояния:
  // A) "Нет данных" — реально нечего отрисовать (weeks_data пустой).
  // B) "Нулевая активность" — ряд есть, но всё по нулям (валидный сценарий: новый мастер, нет бронирований).
  const hasNoData = !stats?.weeks_data || stats.weeks_data.length === 0;
  const hasZeroActivity =
    !hasNoData && stats!.weeks_data.every((p) => (p.bookings || 0) === 0 && (p.income || 0) === 0);

  if (loading && !stats && hasExtendedStats) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </ScreenContainer>
    );
  }

  // Демо-режим при отсутствии доступа к расширенной статистике
  if (!featuresLoading && !hasExtendedStats) {
    const plans: any[] = []; // Stats doesn't load plans - use empty for cheapestPlanName
    const cheapestPlanName = getCheapestPlanForFeature(plans, 'has_extended_stats');
    const description = cheapestPlanName
      ? `Расширенная статистика доступна в тарифе ${cheapestPlanName}.`
      : 'Расширенная статистика доступна в подписке.';

    return (
      <ScreenContainer scrollable>
        <DemoAccessBanner
          description={description}
          ctaText="Перейти к тарифам"
          onCtaPress={() => router.push('/subscriptions')}
        />
        <View style={styles.screenContent}>
          <View style={[styles.header, { flexDirection: 'row', alignItems: 'center' }]}>
            <Text style={styles.title}>Статистика</Text>
            <View style={styles.demoBadge}><Text style={styles.demoBadgeText}>Демо</Text></View>
          </View>
          <Text style={styles.sectionTitle}>Показатели</Text>
          <View style={styles.kpiRow}>
            <Card style={[styles.softCard, styles.kpiCard]}>
              <Text style={styles.kpiTitle}>Бронирования</Text>
              <Text style={styles.kpiValue}>{statsDemo.current_week_bookings}</Text>
            </Card>
            <Card style={[styles.softCard, styles.kpiCard]}>
              <Text style={styles.kpiTitle}>Доход</Text>
              <Text style={styles.kpiValue}>{formatRubles(statsDemo.current_week_income)}</Text>
            </Card>
          </View>
          <Text style={styles.sectionTitle}>Топ услуг</Text>
          <Card style={[styles.softCard, styles.card]}>
            {statsDemo.top_services_by_bookings?.slice(0, 5).map((s: any, i: number) => (
              <View key={i} style={styles.topItem}>
                <View style={styles.topLeft}>
                  <Text style={styles.rank}>#{i + 1}</Text>
                  <Text style={styles.topName}>{s.service_name}</Text>
                </View>
                <Text style={styles.topValue}>{s.booking_count} записей</Text>
              </View>
            ))}
          </Card>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer 
      scrollable
      scrollViewProps={{
        refreshControl: <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />,
        contentContainerStyle: { paddingBottom: 90 },
        nestedScrollEnabled: true,
        keyboardShouldPersistTaps: 'handled',
        directionalLockEnabled: true,
      }}
    >
      <View style={styles.screenContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Статистика</Text>
        </View>

        {error && (
          <Card style={[styles.softCard, styles.errorCard]}>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        )}

        {/* Период — вверху: влияет и на базовую, и на расширенную статистику */}
        <Card style={[styles.softCard, styles.card]}>
          <Text style={styles.sectionTitle}>Период</Text>
          <View style={styles.periodTabsWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.periodChips}
              nestedScrollEnabled
              directionalLockEnabled={Platform.OS === 'ios'}
            >
              {periods.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  onPress={() => {
                    setSelectedPeriod(p.key);
                    setTimeOffset(0);
                    if (p.key === 'day') {
                      setDayAnchorDate(new Date().toISOString().slice(0, 10));
                    }
                  }}
                  style={[styles.chip, selectedPeriod === p.key && styles.chipActive]}
                >
                  <Text style={[styles.chipText, selectedPeriod === p.key && styles.chipTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.periodToolbar}>
            <View style={styles.navRow}>
              <Pressable
                onPress={() => {
                  if (selectedPeriod === 'day') {
                    const d = new Date(dayAnchorDate);
                    d.setDate(d.getDate() - 1);
                    setDayAnchorDate(d.toISOString().slice(0, 10));
                  } else {
                    setTimeOffset((v) => v - 1);
                  }
                }}
                style={({ pressed }) => [
                  styles.navBtnIcon,
                  styles.navBtnCircle,
                  pressed && styles.navBtnPressed,
                ]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Предыдущий период"
              >
                <Ionicons name="chevron-back" size={24} color="#333" />
              </Pressable>
              <TouchableOpacity
                onPress={() => {
                  if (selectedPeriod === 'day') {
                    setDayAnchorDate(new Date().toISOString().slice(0, 10));
                  } else {
                    setTimeOffset(0);
                  }
                }}
                style={styles.navBtnCenter}
              >
                <Text style={styles.navBtnCenterText}>{currentPeriodLabel}</Text>
              </TouchableOpacity>
              <Pressable
                onPress={() => {
                  if (selectedPeriod === 'day') {
                    const d = new Date(dayAnchorDate);
                    d.setDate(d.getDate() + 1);
                    setDayAnchorDate(d.toISOString().slice(0, 10));
                  } else {
                    setTimeOffset((v) => v + 1);
                  }
                }}
                style={({ pressed }) => [
                  styles.navBtnIcon,
                  styles.navBtnCircle,
                  pressed && styles.navBtnPressed,
                ]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Следующий период"
              >
                <Ionicons name="chevron-forward" size={24} color="#333" />
              </Pressable>
            </View>
            <View style={styles.toolbarResetRow}>
              <TouchableOpacity
                onPress={() => {
                  if (selectedPeriod === 'day') {
                    setDayAnchorDate(new Date().toISOString().slice(0, 10));
                  } else {
                    setTimeOffset(0);
                  }
                }}
                style={styles.resetPeriodBtn}
                activeOpacity={0.8}
                accessibilityLabel={resetPeriodLabel}
              >
                <Ionicons name="refresh" size={14} color="#4CAF50" />
                <Text style={styles.resetPeriodBtnText}>{resetPeriodLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>

        {/* Переключатель режима — сразу под периодом, до контента */}
        <View style={styles.toggleContainer}>
        {featuresLoading ? (
          <View style={[styles.proGateRow, { justifyContent: 'flex-start' }]}>
            <ActivityIndicator size="small" color="#4CAF50" />
            <Text style={[styles.proHint, { marginLeft: 8 }]}>Загрузка подписки…</Text>
          </View>
        ) : (
          <>
            <SegmentedControl
              segments={[
                { key: 'base', label: 'Базовая' },
                { key: 'extended', label: 'Расширенная' },
              ]}
              selectedIndex={showExtended ? 1 : 0}
              disabledIndexes={!hasExtendedStats ? [1] : undefined}
              onSegmentChange={(index) => {
                if (index === 0) setShowExtended(false);
                if (index === 1) {
                  if (!hasExtendedStats) return;
                  setShowExtended(true);
                }
              }}
            />
            {!isPro && (
              <View style={styles.proGateRow}>
                <Text style={styles.proHint}>Доступно в Pro</Text>
                <TouchableOpacity onPress={() => router.push('/subscriptions')} activeOpacity={0.7}>
                  <Text style={styles.proCtaText}>Управление подпиской</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
        </View>

        {/* Базовая: показатели + топы — всегда; расширенная добавляется ниже */}
            <Text style={styles.sectionTitle}>Показатели</Text>
            {hasNoData ? (
              <Card style={[styles.softCard, styles.card]}>
                <EmptyState />
              </Card>
            ) : (
              <>
                <View style={styles.kpiRow}>
                  <Card padding={12} style={[styles.softCard, styles.kpiCard]}>
                    <Text style={styles.kpiTitle}>Бронирования</Text>
                    <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                      {baseKpi.bookingsCurrent}
                    </Text>
                    <View style={styles.kpiMetaCol}>
                      {baseKpi.bookings.percent !== null ? (
                        <Text style={[styles.kpiDelta, baseKpi.bookings.percent >= 0 ? styles.pos : styles.neutral]}>
                          {baseKpi.bookings.percent >= 0 ? '+' : ''}
                          {baseKpi.bookings.percent}%
                        </Text>
                      ) : (
                        <Text style={[styles.kpiDelta, styles.neutral]}>{baseKpi.bookings.label ?? '—'}</Text>
                      )}
                      <Text style={styles.kpiMetaText} numberOfLines={2}>
                        к прошл. ({baseKpi.bookingsPrevious})
                        {baseKpi.bookings.absoluteDelta !== 0 && baseKpi.bookings.percent === null && (
                          <> · +{baseKpi.bookings.absoluteDelta}</>
                        )}
                      </Text>
                    </View>
                  </Card>

                  <Card padding={12} style={[styles.softCard, styles.kpiCard]}>
                    <Text style={styles.kpiTitle}>Доход</Text>
                    <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {formatRubles(baseKpi.incomeCurrent)}
                    </Text>
                    <View style={styles.kpiMetaCol}>
                      {baseKpi.income.percent !== null ? (
                        <Text style={[styles.kpiDelta, baseKpi.income.percent >= 0 ? styles.pos : styles.neutral]}>
                          {baseKpi.income.percent >= 0 ? '+' : ''}
                          {baseKpi.income.percent}%
                        </Text>
                      ) : (
                        <Text style={[styles.kpiDelta, styles.neutral]}>{baseKpi.income.label ?? '—'}</Text>
                      )}
                      <Text style={styles.kpiMetaText} numberOfLines={2}>
                        к прошл. ({formatRubles(baseKpi.incomePrevious)})
                        {baseKpi.income.absoluteDelta !== 0 && baseKpi.income.percent === null && (
                          <> · +{formatRubles(baseKpi.income.absoluteDelta)}</>
                        )}
                      </Text>
                    </View>
                  </Card>
                </View>

                {hasZeroActivity && (
                  <Text style={styles.zeroHint}>
                    За выбранный период пока нет бронирований. Попробуйте изменить период или добавьте записи.
                  </Text>
                )}
              </>
            )}

            <Card style={[styles.softCard, styles.card]}>
              <Text style={styles.sectionTitle}>Топ по записям</Text>
              {!!stats?.top_period_range && <Text style={styles.periodHint}>{stats.top_period_range}</Text>}
              {stats?.top_services_by_bookings && stats.top_services_by_bookings.length > 0 ? (
                <View style={styles.topList}>
                  {stats.top_services_by_bookings.slice(0, 3).map((s, idx) => (
                    <View key={`${s.service_id}-${idx}`} style={styles.topItem}>
                      <View style={styles.topLeft}>
                        <Text style={styles.rank}>#{idx + 1}</Text>
                        <Text style={styles.topName}>{s.service_name}</Text>
                      </View>
                      <Text style={styles.topValue}>{s.booking_count ?? 0} записей</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState title={hasNoData ? 'Нет данных за период' : 'Пока нет данных для топа'} subtitle="" />
              )}
            </Card>

            <Card style={[styles.softCard, styles.card]}>
              <Text style={styles.sectionTitle}>Топ по доходу</Text>
              {!!stats?.top_period_range && <Text style={styles.periodHint}>{stats.top_period_range}</Text>}
              {stats?.top_services_by_earnings && stats.top_services_by_earnings.length > 0 ? (
                <View style={styles.topList}>
                  {stats.top_services_by_earnings.slice(0, 3).map((s, idx) => (
                    <View key={`${s.service_id}-${idx}`} style={styles.topItem}>
                      <View style={styles.topLeft}>
                        <Text style={styles.rank}>#{idx + 1}</Text>
                        <Text style={styles.topName}>{s.service_name}</Text>
                      </View>
                      <Text style={styles.topValue}>{formatRubles(s.total_earnings ?? 0)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState title={hasNoData ? 'Нет данных за период' : 'Пока нет данных для топа'} subtitle="" />
              )}
            </Card>

        {/* Расширенная: график + сводки (дополнение к базовой) */}
        {showExtended && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Расширенная статистика</Text>

            {extendedLoading && (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color="#4CAF50" />
                <Text style={styles.inlineLoadingText}>Загрузка расширенной статистики...</Text>
              </View>
            )}

            {extendedForbidden && (
              <Card style={[styles.softCard, styles.paywall]}>
                <Text style={styles.paywallTitle}>Доступно в Pro</Text>
                <Text style={styles.paywallText}>Обновите подписку для доступа к расширенной статистике</Text>
                <PrimaryButton title="Управление подпиской" onPress={() => router.push('/subscriptions')} />
              </Card>
            )}

            {!extendedForbidden && (
              <>
                {extendedError && <Text style={styles.neutralErrorText}>{extendedError}</Text>}

                <Text style={styles.chartSectionLabel}>График динамики</Text>
                <View style={styles.chartMetricToggle}>
                  <SegmentedControl
                    segments={[
                      { key: 'bookings', label: 'Бронирования' },
                      { key: 'income', label: 'Доход' },
                    ]}
                    selectedIndex={chartMetric === 'bookings' ? 0 : 1}
                    onSegmentChange={(index) => setChartMetric(index === 0 ? 'bookings' : 'income')}
                  />
                </View>

                <Card style={[styles.softCard, styles.chartCardWrap]}>
                  {hasNoData ? (
                    <View style={styles.periodChartEmpty}>
                      <Text style={styles.periodChartHint}>Нет ряда дат для графика</Text>
                    </View>
                  ) : (
                    <View style={styles.periodChartsStack} collapsable={false}>
                      {chartMetric === 'bookings' ? (
                        <BarLineChart
                          title="Бронирования по периоду"
                          compact
                          data={bookingsBarData}
                          barValueSuffix="шт"
                          initialSelectedIndex={selectedPeriod === 'day' ? (stats?.selected_index ?? 9) : undefined}
                          onBarSelect={
                            selectedPeriod === 'day'
                              ? (idx, periodStart) => {
                                  if (__DEV__) {
                                    logger.debug('dashboard', '[STATS] day bar', { idx, periodStart });
                                  }
                                }
                              : undefined
                          }
                        />
                      ) : (
                        <BarLineChart
                          title="Доход по периоду"
                          compact
                          data={incomeBarData}
                          formatBarValue={(v) => formatRubles(v)}
                          initialSelectedIndex={selectedPeriod === 'day' ? (stats?.selected_index ?? 9) : undefined}
                          onBarSelect={
                            selectedPeriod === 'day'
                              ? (idx, periodStart) => {
                                  if (__DEV__) {
                                    logger.debug('dashboard', '[STATS] day bar income', { idx, periodStart });
                                  }
                                }
                              : undefined
                          }
                        />
                      )}
                    </View>
                  )}
                </Card>

                <View style={styles.summaryHeaderRow}>
                  <Text style={styles.summarySectionTitle}>Сводка</Text>
                  <Text style={styles.summaryLegendHeader}>
                    <Text style={styles.summaryLegendFact}>Факт</Text>
                    <Text style={styles.summaryLegendDot}> · </Text>
                    <Text style={styles.summaryLegendPlan}>План</Text>
                    <Text style={styles.summaryLegendDot}> · </Text>
                    <Text style={styles.summaryLegendTotal}>Факт + План</Text>
                  </Text>
                </View>
                <View style={styles.extRow}>
                  <Card style={[styles.softCard, styles.extCellCard]}>
                    <Text style={styles.extCellTitle} numberOfLines={1}>
                      Текущий период
                    </Text>
                    <Text style={styles.extCellValue} numberOfLines={2}>
                      <Text style={styles.summaryFactValue}>
                        {extendedStats?.current_period?.factual?.bookings_count ?? 0}
                      </Text>
                      <Text style={styles.summaryMutedValue}> (</Text>
                      <Text style={styles.summaryPlanValue}>
                        {extendedStats?.current_period?.plan?.bookings_count ??
                          extendedStats?.current_period?.upcoming?.bookings_count ??
                          0}
                      </Text>
                      <Text style={styles.summaryMutedValue}>)</Text>
                    </Text>
                    <Text style={styles.extMoneyRow} numberOfLines={2}>
                      <Text style={styles.summaryMoneyFact}>
                        {formatMoney(extendedStats?.current_period?.factual?.revenue ?? 0)}
                      </Text>
                      <Text style={styles.summaryMoneyMuted}> ₽ (</Text>
                      <Text style={styles.summaryMoneyPlan}>
                        {formatMoney(
                          extendedStats?.current_period?.plan?.revenue ??
                            extendedStats?.current_period?.upcoming?.revenue ??
                            0
                        )}
                      </Text>
                      <Text style={styles.summaryMoneyMuted}>)</Text>
                    </Text>
                  </Card>
                  <Card style={[styles.softCard, styles.extCellCard]}>
                    <Text style={styles.extCellTitle} numberOfLines={1}>
                      Сравнение
                    </Text>
                    <Text style={[styles.extCellValue, styles.summaryCompareValue]} numberOfLines={1}>
                      {(extendedStats?.comparison?.revenue_change_percent ?? 0) >= 0 ? '+' : ''}
                      {(extendedStats?.comparison?.revenue_change_percent ?? 0).toFixed(1)}% (₽)
                    </Text>
                    <Text style={[styles.extCellSub, styles.summaryCompareSub]} numberOfLines={1}>
                      {(extendedStats?.comparison?.bookings_change_percent ?? 0) >= 0 ? '+' : ''}
                      {(extendedStats?.comparison?.bookings_change_percent ?? 0).toFixed(1)}% записей
                    </Text>
                  </Card>
                  {extendedStats?.forecast && (
                    <Card style={[styles.softCard, styles.extCellCard]}>
                      <Text style={[styles.extCellTitle, styles.summaryTotalTitle]} numberOfLines={1}>
                        Итого
                      </Text>
                      <Text style={[styles.extCellValue, styles.summaryTotalValue]} numberOfLines={1}>
                        {formatMoney(
                          extendedStats.current_period?.period_total?.revenue ??
                            extendedStats.forecast.predicted_revenue ??
                            0
                        )}
                      </Text>
                      <Text style={[styles.extCellSub, styles.summaryTotalValue]} numberOfLines={1}>
                        {extendedStats.current_period?.period_total?.bookings_count ??
                          extendedStats.forecast.predicted_bookings ??
                          0}{' '}
                        записей
                      </Text>
                    </Card>
                  )}
                </View>
              </>
            )}
          </View>
        )}

      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  errorCard: {
    backgroundColor: '#FFEBEE',
    marginBottom: 16,
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
  },
  card: {
    marginBottom: 16,
  },
  softCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eeeeee',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowColor: 'transparent',
    elevation: 0,
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    alignItems: 'stretch',
  },
  kpiCard: {
    flex: 1,
    minWidth: 0,
  },
  kpiTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  kpiMetaCol: {
    marginTop: 6,
    gap: 2,
  },
  kpiMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  kpiDelta: {
    fontSize: 11,
    fontWeight: '700',
  },
  kpiMetaText: {
    fontSize: 10,
    color: '#777',
    lineHeight: 13,
  },
  pos: { color: '#4CAF50' },
  neutral: { color: '#666' },
  toggleContainer: {
    marginBottom: 16,
  },
  chartSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  chartMetricToggle: {
    marginBottom: 12,
  },
  chartCardWrap: {
    marginBottom: 16,
  },
  proGateRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  proHint: {
    fontSize: 12,
    color: '#666',
  },
  proCtaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  demoBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginLeft: 8 },
  demoBadgeText: { fontSize: 12, color: '#92400E', fontWeight: '600' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  periodHint: {
    fontSize: 11,
    color: '#777',
    marginBottom: 6,
  },
  zeroHint: {
    fontSize: 13,
    color: '#666',
    marginTop: 10,
    marginBottom: 16,
  },
  periodChartsStack: {
    marginTop: 16,
    width: '100%',
    overflow: 'visible',
  },
  periodChartEmpty: {
    marginTop: 12,
    paddingVertical: 8,
  },
  periodChartHint: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
  chartSpacer: {
    height: 8,
  },
  topList: {
    marginTop: 4,
  },
  topItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  topLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  rank: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 28,
    color: '#999',
  },
  topName: {
    fontSize: 14,
    color: '#111',
    flex: 1,
  },
  topValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
  },
  periodChips: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  periodTabsWrap: {
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  chip: {
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#EEF0F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#4CAF50',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475467',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  periodToolbar: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7EAEE',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  navBtnIcon: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  navBtnPressed: {
    opacity: 0.75,
  },
  navBtnCenter: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnCenterText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  toolbarResetRow: {
    marginTop: 8,
    alignItems: 'center',
  },
  resetPeriodBtn: {
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D7EBD9',
    backgroundColor: '#F3FAF4',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resetPeriodBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  inlineLoadingText: {
    fontSize: 12,
    color: '#666',
  },
  paywall: {
    marginBottom: 12,
  },
  paywallTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  paywallText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  neutralErrorText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 6,
  },
  summarySectionTitle: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: '#374151',
    textTransform: 'uppercase',
  },
  summaryLegendHeader: {
    flexShrink: 1,
    fontSize: 9,
    textAlign: 'right',
    lineHeight: 12,
  },
  summaryLegendTotal: {
    fontSize: 9,
    fontWeight: '600',
    color: '#111',
  },
  summaryCompareValue: {
    color: '#111',
  },
  summaryCompareSub: {
    color: '#111',
  },
  summaryTotalTitle: {
    color: '#111',
  },
  summaryTotalValue: {
    color: '#111',
  },
  extRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'stretch',
  },
  extCellCard: {
    flex: 1,
    minWidth: 140,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 0,
  },
  extCellTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    lineHeight: 13,
  },
  extCellValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
  },
  extCellSub: {
    fontSize: 11,
    fontWeight: '400',
    color: '#666',
    marginTop: 2,
  },
  summaryFactValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4CAF50',
  },
  summaryPlanValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64B5F6',
  },
  summaryMutedValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  extMoneyRow: {
    marginTop: 2,
  },
  summaryMoneyFact: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4CAF50',
  },
  summaryMoneyPlan: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64B5F6',
  },
  summaryMoneyMuted: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  summaryLegendFact: {
    fontSize: 9,
    fontWeight: '600',
    color: '#4CAF50',
  },
  summaryLegendPlan: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64B5F6',
  },
  summaryLegendDot: {
    fontSize: 9,
    color: '#d1d5db',
  },
});

