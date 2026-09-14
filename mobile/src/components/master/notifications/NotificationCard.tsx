import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { getNotificationStripeColor } from '@src/utils/masterNotificationsUtils';
import { ClientStatusChip } from './ClientStatusChip';
import type { MasterScheduleNotification } from './notificationsTypes';

interface NotificationCardProps {
  item: MasterScheduleNotification;
  onPress?: (item: MasterScheduleNotification) => void;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function overlineForType(type: MasterScheduleNotification['type']): string {
  if (type === 'created') return 'Новая запись';
  if (type === 'cancelled') return 'Отмена записи';
  return 'Изменение записи';
}

export function NotificationCard({ item, onPress }: NotificationCardProps) {
  const stripeColor = getNotificationStripeColor(item.type);
  const unread = item.isUnread;
  const heading = item.clientName?.trim() || item.title;
  const showUpdatedCompare = Boolean(
    item.type === 'updated' && item.oldDateLabel && item.newDateLabel
  );
  const showWhen = Boolean(
    (item.type === 'created' || item.type === 'cancelled') && item.dateLabel && item.timeLabel
  );

  return (
    <TouchableOpacity
      style={[styles.card, unread ? styles.cardUnread : styles.cardRead]}
      onPress={() => onPress?.(item)}
      activeOpacity={onPress ? 0.88 : 1}
      disabled={!onPress}
      accessibilityRole="button"
    >
      <View style={[styles.stripe, { backgroundColor: stripeColor }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <Text style={styles.overline}>{overlineForType(item.type)}</Text>
            <Text style={[styles.name, unread && styles.nameUnread]}>{heading}</Text>
            {item.body ? <Text style={styles.bodyText}>{item.body}</Text> : null}
          </View>
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>

        {showWhen ? (
          <View style={styles.metaRow}>
            {item.clientStatus ? <ClientStatusChip status={item.clientStatus} /> : null}
            <Text style={styles.metaText}>
              {item.dateLabel} · {item.timeLabel}
            </Text>
          </View>
        ) : null}

        {showUpdatedCompare ? (
          <View style={styles.compare}>
            <View style={styles.compareRow}>
              <Text style={styles.compareTag}>Было</Text>
              <Text style={styles.compareVal}>
                {item.oldDateLabel} · {item.oldTimeLabel}
              </Text>
            </View>
            <View style={[styles.compareRow, styles.compareRowNew]}>
              <Text style={[styles.compareTag, styles.compareTagNew]}>Стало</Text>
              <Text style={styles.compareVal}>
                {item.newDateLabel} · {item.newTimeLabel}
              </Text>
            </View>
          </View>
        ) : null}

        {item.serviceName ? <InfoRow label="Услуга" value={item.serviceName} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
  },
  cardUnread: {
    backgroundColor: '#FCFFFC',
    borderColor: '#DCECDD',
  },
  cardRead: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8ECE8',
  },
  stripe: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  topLeft: {
    flex: 1,
    minWidth: 0,
  },
  overline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#8A948A',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2A1F',
    letterSpacing: -0.3,
  },
  nameUnread: {
    fontWeight: '700',
  },
  bodyText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#657065',
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    marginTop: 4,
    flexShrink: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#657065',
  },
  compare: {
    backgroundColor: '#FAFCFA',
    borderWidth: 1,
    borderColor: '#ECF0EC',
    borderRadius: 14,
    padding: 10,
    gap: 8,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compareRowNew: {},
  compareTag: {
    width: 44,
    fontSize: 12,
    fontWeight: '700',
    color: '#657065',
  },
  compareTagNew: {
    color: '#2F7D32',
  },
  compareVal: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2A1F',
    letterSpacing: -0.2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  infoLabel: {
    fontSize: 13,
    color: '#657065',
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2A1F',
  },
});
