import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MasterScheduleNotification, NotificationFilterKey } from './notificationsTypes';
import { NotificationFilters } from './NotificationFilters';
import { NotificationSectionHeader } from './NotificationSectionHeader';
import { NotificationCard } from './NotificationCard';
import {
  filterNotifications,
  getNotificationEmptyCopy,
  groupNotificationsByDate,
} from '@src/utils/masterNotificationsUtils';
import type { NotificationFetchErrorKind } from './masterNotificationsMapper';

interface NotificationsSheetProps {
  visible: boolean;
  onClose: () => void;
  notifications: MasterScheduleNotification[];
  loading?: boolean;
  refreshing?: boolean;
  loadingMore?: boolean;
  error?: NotificationFetchErrorKind | null;
  hasMore?: boolean;
  onRefresh?: () => void;
  onRetry?: () => void;
  onLoadMore?: () => void;
}

function errorMessage(kind: NotificationFetchErrorKind): string {
  if (kind === 'unavailable') return 'Уведомления пока недоступны';
  if (kind === 'network') return 'Нет соединения. Попробуйте ещё раз';
  return 'Не удалось загрузить уведомления';
}

export function NotificationsSheet({
  visible,
  onClose,
  notifications,
  loading = false,
  refreshing = false,
  loadingMore = false,
  error = null,
  hasMore = false,
  onRefresh,
  onRetry,
  onLoadMore,
}: NotificationsSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * 0.82);
  const [filter, setFilter] = useState<NotificationFilterKey>('all');
  const closingRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setFilter('all');
      closingRef.current = false;
    }
  }, [visible]);

  const filtered = useMemo(
    () => filterNotifications(notifications, filter),
    [notifications, filter]
  );

  const sections = useMemo(() => groupNotificationsByDate(filtered), [filtered]);
  const emptyCopy = getNotificationEmptyCopy(filter);

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  };

  const showInitialError = Boolean(error && notifications.length === 0 && !loading);
  const showEmpty = !loading && !showInitialError && sections.length === 0;

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

          {loading && notifications.length === 0 ? (
            <View style={styles.empty} testID="notifications-loading">
              <ActivityIndicator size="large" color="#4CAF50" />
            </View>
          ) : showInitialError && error ? (
            <View style={styles.empty} testID="notifications-error">
              <View style={styles.emptyIcon}>
                <Ionicons name="cloud-offline-outline" size={22} color="#4CAF50" />
              </View>
              <Text style={styles.emptyTitle}>{errorMessage(error)}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={onRetry} testID="notifications-retry">
                <Text style={styles.retryText}>Повторить</Text>
              </TouchableOpacity>
            </View>
          ) : showEmpty ? (
            <View style={styles.empty} testID="notifications-empty">
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-off-outline" size={22} color="#4CAF50" />
              </View>
              <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
              <Text style={styles.emptyText}>{emptyCopy.text}</Text>
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
              refreshControl={
                onRefresh ? (
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />
                ) : undefined
              }
              onEndReached={() => {
                if (hasMore && !loadingMore) onLoadMore?.();
              }}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.footer}>
                    <ActivityIndicator color="#4CAF50" />
                  </View>
                ) : null
              }
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
  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2E7D32',
  },
  footer: {
    paddingVertical: 16,
  },
});
