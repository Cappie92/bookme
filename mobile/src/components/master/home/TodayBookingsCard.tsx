import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@src/components/Card';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { StatusBadge } from '@src/components/StatusBadge';
import type { Booking } from '@src/services/api/bookings';
import { getStatusColor, getStatusLabel } from '@src/services/api/bookings';
import { formatTimeHHMM } from '@src/utils/format';
import {
  filterTodayBookings,
  getBookingClientLabel,
  TODAY_BOOKINGS_LIMIT,
} from '@src/utils/masterHomeToday';

export interface TodayBookingsCardProps {
  bookings: Booking[];
}

function formatTodaySubtitle(count: number): string {
  const dateLabel = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
  if (count === 0) return dateLabel;
  const word = count === 1 ? 'запись' : count < 5 ? 'записи' : 'записей';
  return `${dateLabel} · ${count} ${word}`;
}

export function TodayBookingsCard({ bookings }: TodayBookingsCardProps) {
  const todayBookings = useMemo(() => filterTodayBookings(bookings), [bookings]);
  const visible = todayBookings.slice(0, TODAY_BOOKINGS_LIMIT);

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Сегодня</Text>
      <Text style={styles.subtitle}>{formatTodaySubtitle(todayBookings.length)}</Text>

      {visible.length === 0 ? (
        <Text style={styles.emptyText}>На сегодня записей нет</Text>
      ) : (
        <View style={styles.list}>
          {visible.map((booking) => (
            <View key={booking.id} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.time}>{formatTimeHHMM(booking.start_time)}</Text>
                <View style={styles.rowText}>
                  <Text style={styles.client} numberOfLines={1}>
                    {getBookingClientLabel(booking)}
                  </Text>
                  <Text style={styles.service} numberOfLines={1}>
                    {booking.service_name || 'Услуга'}
                  </Text>
                </View>
              </View>
              <StatusBadge
                label={getStatusLabel(booking.status)}
                color={getStatusColor(booking.status)}
              />
            </View>
          ))}
        </View>
      )}

      <SecondaryButton
        title="Открыть расписание"
        onPress={() => router.push('/master/schedule')}
        style={styles.cta}
      />
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  list: {
    marginBottom: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  time: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2e7d32',
    minWidth: 44,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  client: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  service: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  cta: {
    marginTop: 4,
  },
});
