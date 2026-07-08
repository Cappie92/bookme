import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getNotificationStripeColor } from '@src/utils/masterNotificationsUtils';
import { ClientStatusChip } from './ClientStatusChip';
import type { MasterScheduleNotification } from './notificationsTypes';

interface NotificationCardProps {
  item: MasterScheduleNotification;
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

export function NotificationCard({ item }: NotificationCardProps) {
  const stripeColor = getNotificationStripeColor(item.type);
  const unread = item.isUnread;

  const overline =
    item.type === 'created'
      ? 'Новая запись'
      : item.type === 'updated'
        ? 'Изменение записи'
        : 'Отмена записи';

  return (
    <View style={[styles.card, unread ? styles.cardUnread : styles.cardRead]}>
      <View style={[styles.stripe, { backgroundColor: stripeColor }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            <Text style={styles.overline}>{overline}</Text>
            <Text style={[styles.name, unread && styles.nameUnread]}>{item.clientName}</Text>
            {item.phone ? <Text style={styles.phone}>{item.phone}</Text> : null}
          </View>
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>

        {item.type === 'created' || item.type === 'cancelled' ? (
          <View style={styles.metaRow}>
            <ClientStatusChip status={item.clientStatus} />
            <Text style={styles.metaText}>
              {item.dateLabel} · {item.timeLabel}
            </Text>
          </View>
        ) : null}

        {item.type === 'updated' ? (
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

        <InfoRow label="Услуга" value={item.serviceName} />
        {item.priceLabel ? <InfoRow label="Стоимость" value={item.priceLabel} /> : null}
      </View>
    </View>
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
  phone: {
    marginTop: 2,
    fontSize: 12,
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
