import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@src/components/Card';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { StatusBadge } from '@src/components/StatusBadge';
import type { Booking } from '@src/services/api/bookings';
import { getStatusColor, getStatusLabel } from '@src/services/api/bookings';
import { formatDateDDMM, formatTimeHHMM } from '@src/utils/format';
import { getBookingClientLabel } from '@src/utils/masterHomeToday';
import { filterUpcomingNotToday } from '@src/utils/masterHomeUpcoming';

export interface UpcomingBookingsPreviewProps {
  bookings: Booking[];
}

export function UpcomingBookingsPreview({ bookings }: UpcomingBookingsPreviewProps) {
  const upcoming = useMemo(() => filterUpcomingNotToday(bookings), [bookings]);

  if (upcoming.length === 0) return null;

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Ближайшие записи</Text>
      <Text style={styles.subtitle}>Не сегодня · до {upcoming.length}</Text>

      <View style={styles.list}>
        {upcoming.map((booking) => (
          <View key={booking.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.datetime}>
                {formatDateDDMM(booking.start_time)} · {formatTimeHHMM(booking.start_time)}
              </Text>
              <Text style={styles.client} numberOfLines={1}>
                {getBookingClientLabel(booking)}
              </Text>
              <Text style={styles.service} numberOfLines={1}>
                {booking.service_name || 'Услуга'}
              </Text>
            </View>
            <StatusBadge
              label={getStatusLabel(booking.status)}
              color={getStatusColor(booking.status)}
            />
          </View>
        ))}
      </View>

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
  list: {
    marginBottom: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  datetime: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    marginBottom: 2,
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
