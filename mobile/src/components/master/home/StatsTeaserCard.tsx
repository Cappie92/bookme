import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@src/components/Card';
import type { DashboardStats } from '@src/services/api/master';
import { formatMoney } from '@src/utils/money';
import {
  buildStatsTeaserData,
  getStatsTeaserCtaRoute,
} from '@src/utils/masterHomeStatsTeaser';

export interface StatsTeaserCardProps {
  stats: DashboardStats | null;
  hasExtendedStats: boolean;
}

export function StatsTeaserCard({ stats, hasExtendedStats }: StatsTeaserCardProps) {
  const teaser = useMemo(() => buildStatsTeaserData(stats), [stats]);
  const ctaRoute = getStatsTeaserCtaRoute(hasExtendedStats);

  if (!teaser) return null;

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Статистика за неделю</Text>

      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{teaser.weekBookings}</Text>
          <Text style={styles.metricLabel}>записей</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{formatMoney(teaser.weekIncome)}</Text>
          <Text style={styles.metricLabel}>доход</Text>
        </View>
      </View>

      {teaser.topServiceName ? (
        <Text style={styles.topService} numberOfLines={2}>
          Топ услуга: {teaser.topServiceName}
          {teaser.topServiceBookings != null ? ` · ${teaser.topServiceBookings} зап.` : ''}
        </Text>
      ) : null}

      <TouchableOpacity
        style={styles.cta}
        onPress={() => router.push(ctaRoute)}
        activeOpacity={0.75}
      >
        <Text style={styles.ctaText}>Подробнее</Text>
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  metrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2e7d32',
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#e8e8e8',
  },
  topService: {
    fontSize: 13,
    color: '#555',
    marginBottom: 12,
  },
  cta: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2e7d32',
  },
});
