import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MasterScheduleNotification } from '@src/components/master/notifications/notificationsTypes';
import {
  DEV_MOCK_SCHEDULE_NOTIFICATIONS,
  NOTIFICATIONS_USE_DEV_MOCK,
} from '@src/components/master/notifications/notificationsMock';
import { applyViewedState, countUnreadNotifications } from '@src/utils/masterNotificationsUtils';
import {
  loadViewedNotificationIds,
  markNotificationsViewed,
} from '@src/utils/masterNotificationsViewedStorage';

export function useMasterNotifications(masterId: number | null | undefined) {
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!masterId) {
      setReady(true);
      return;
    }
    loadViewedNotificationIds(masterId).then((ids) => {
      if (!cancelled) {
        setViewedIds(ids);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [masterId]);

  const sourceNotifications: MasterScheduleNotification[] = useMemo(() => {
    if (NOTIFICATIONS_USE_DEV_MOCK) return DEV_MOCK_SCHEDULE_NOTIFICATIONS;
    return [];
  }, []);

  const notifications = useMemo(
    () => applyViewedState(sourceNotifications, viewedIds),
    [sourceNotifications, viewedIds]
  );

  const unreadCount = useMemo(() => countUnreadNotifications(notifications), [notifications]);

  const markCurrentAsViewed = useCallback(async () => {
    if (!masterId || notifications.length === 0) return;
    const ids = notifications.map((n) => n.id);
    const next = await markNotificationsViewed(masterId, ids);
    setViewedIds(next);
  }, [masterId, notifications]);

  return {
    notifications,
    unreadCount,
    ready,
    markCurrentAsViewed,
    usesDevMock: NOTIFICATIONS_USE_DEV_MOCK,
  };
}
