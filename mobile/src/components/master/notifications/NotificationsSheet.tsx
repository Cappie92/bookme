import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MasterScheduleNotification, NotificationFilterKey } from './notificationsTypes';
import { NotificationFilters } from './NotificationFilters';
import { NotificationSectionHeader } from './NotificationSectionHeader';
import { NotificationCard } from './NotificationCard';
import { filterNotifications, groupNotificationsByDate } from '@src/utils/masterNotificationsUtils';

interface NotificationsSheetProps {
  visible: boolean;
  onClose: () => void;
  notifications: MasterScheduleNotification[];
  onMarkViewed?: () => void;
}

export function NotificationsSheet({
  visible,
  onClose,
  notifications,
  onMarkViewed,
}: NotificationsSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * 0.82);
  const [filter, setFilter] = useState<NotificationFilterKey>('all');

  useEffect(() => {
    if (!visible) setFilter('all');
  }, [visible]);

  const filtered = useMemo(
    () => filterNotifications(notifications, filter),
    [notifications, filter]
  );

  const sections = useMemo(() => groupNotificationsByDate(filtered), [filtered]);

  const handleClose = () => {
    onMarkViewed?.();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Уведомления</Text>
              <Text style={styles.subtitle}>Изменения в расписании</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Закрыть"
            >
              <Ionicons name="close" size={22} color="#657065" />
            </TouchableOpacity>
          </View>

          <NotificationFilters value={filter} onChange={setFilter} />

          {sections.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-off-outline" size={22} color="#4CAF50" />
              </View>
              <Text style={styles.emptyTitle}>Пока нет уведомлений</Text>
              <Text style={styles.emptyText}>
                Здесь будут изменения по новым, перенесённым и отменённым записям
              </Text>
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              renderSectionHeader={({ section }) => (
                <NotificationSectionHeader title={section.title} />
              )}
              renderItem={({ item }) => <NotificationCard item={item} />}
              stickySectionHeadersEnabled={false}
              showsVerticalScrollIndicator
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(31, 42, 31, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FCFDFC',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#DFE8DF',
    paddingHorizontal: 16,
    paddingTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#1F2A1F',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
      },
      android: { elevation: 16 },
    }),
  },
  handle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D4DCD4',
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1F2A1F',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#657065',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E4ECE4',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F7FBF7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2A1F',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#657065',
    textAlign: 'center',
    lineHeight: 20,
  },
});
