import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card } from '@src/components/Card';
import type { Booking } from '@src/services/api/bookings';
import type { MasterSettings } from '@src/services/api/master';
import {
  buildHomeAttentionItems,
  type HomeAttentionItem,
  type SetupAttentionSource,
} from '@src/utils/masterHomeAttention';

export interface AttentionCardProps {
  futureBookings: Booking[];
  pastBookings: Booking[];
  master: MasterSettings['master'] | null;
  setupSources: SetupAttentionSource[];
  hasExtendedStats?: boolean;
  onConfirmPreVisit?: (bookingId: number) => void;
  onConfirmPostVisit?: (bookingId: number) => void;
}

function handleItemPress(
  item: HomeAttentionItem,
  onConfirmPreVisit?: (bookingId: number) => void,
  onConfirmPostVisit?: (bookingId: number) => void
) {
  if (item.actionType === 'confirm_pre_visit' && item.bookingId != null) {
    onConfirmPreVisit?.(item.bookingId);
    return;
  }
  if (item.actionType === 'confirm_post_visit' && item.bookingId != null) {
    onConfirmPostVisit?.(item.bookingId);
    return;
  }
  if (item.route) {
    router.push(item.route as any);
  }
}

export function AttentionCard({
  futureBookings,
  pastBookings,
  master,
  setupSources,
  hasExtendedStats = false,
  onConfirmPreVisit,
  onConfirmPostVisit,
}: AttentionCardProps) {
  const items = useMemo(
    () =>
      buildHomeAttentionItems({
        futureBookings,
        pastBookings,
        master,
        setupSources,
        hasExtendedStats,
      }),
    [futureBookings, pastBookings, master, setupSources, hasExtendedStats]
  );

  if (items.length === 0) return null;

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Требуют внимания</Text>
      <View style={styles.list}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.row}
            activeOpacity={0.75}
            onPress={() => handleItemPress(item, onConfirmPreVisit, onConfirmPostVisit)}
          >
            <View style={styles.rowText}>
              <Text style={styles.label}>{item.label}</Text>
              {item.description ? (
                <Text style={styles.description} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <View style={styles.action}>
              <Text style={styles.actionLabel}>{item.actionLabel}</Text>
              <Ionicons name="chevron-forward" size={16} color="#4CAF50" />
            </View>
          </TouchableOpacity>
        ))}
      </View>
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
  list: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  description: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4CAF50',
  },
});
