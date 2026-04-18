import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Card } from '@src/components/Card';
import { BarLineChart } from '@src/components/stats/BarLineChart';
import { DashboardStatsPeriodPoint } from '@src/services/api/master';
import { formatMoney } from '@src/utils/money';
import { calcChange } from '@src/utils/statsChange';
import {
  EnrichedMasterStatsPoint,
  toBookingsBarLinePoint,
  toIncomeBarLinePoint,
} from '@src/utils/masterDashboardChartPoints';

interface WeeklyStatsChartsProps {
  weeksData: DashboardStatsPeriodPoint[];
  loading?: boolean;
}

export function WeeklyStatsCharts({ weeksData, loading = false }: WeeklyStatsChartsProps) {
  const chartData = useMemo(() => {
    const weeks = weeksData || [];
    return weeks.map((p, index) => {
      const prev = index > 0 ? weeks[index - 1] : null;
      const prevB = prev?.bookings_total ?? prev?.bookings ?? 0;
      const prevI = prev?.income_total_rub ?? prev?.income ?? 0;
      const curB = p.bookings_total ?? p.bookings ?? 0;
      const curI = p.income_total_rub ?? p.income ?? 0;
      const bChange = calcChange(curB, prevB);
      const iChange = calcChange(curI, prevI);
      const row: EnrichedMasterStatsPoint = {
        ...p,
        bookings_change: bChange.percent ?? 0,
        income_change: iChange.percent ?? 0,
        bookings_change_label: bChange.label,
        income_change_label: iChange.label,
        bookings_change_delta: bChange.absoluteDelta,
        income_change_delta: iChange.absoluteDelta,
      };
      return row;
    });
  }, [weeksData]);

  const hasData = chartData.length > 0;

  if (!hasData && !loading) return null;

  return (
    <Card style={styles.card}>
      <Text style={styles.sectionTitle}>Статистика за неделю</Text>
      {!hasData ? (
        <Text style={styles.emptyText}>Нет данных за период</Text>
      ) : (
        <View style={styles.chartsStack}>
          <BarLineChart title="Бронирования" data={chartData.map(toBookingsBarLinePoint)} barValueSuffix="шт" />
          <View style={styles.chartSpacer} />
          <BarLineChart title="Доход" data={chartData.map(toIncomeBarLinePoint)} formatBarValue={(v) => formatMoney(v)} />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
  },
  chartsStack: {
    gap: 10,
  },
  chartSpacer: {
    height: 10,
  },
});
