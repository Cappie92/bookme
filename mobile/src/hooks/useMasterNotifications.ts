import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { useAuth } from '@src/auth/AuthContext';
import {
  getNotificationUnreadCount,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@src/services/api/notifications';
import { canRegisterPushForUser } from '@src/services/push/pushEligibility';
import {
  classifyNotificationFetchError,
  mapBackendNotificationToViewModel,
  mergeNotificationPages,
  parseNotificationId,
  type NotificationFetchErrorKind,
} from '@src/components/master/notifications/masterNotificationsMapper';
import type { MasterScheduleNotification } from '@src/components/master/notifications/notificationsTypes';
import { groupNotificationsByDate } from '@src/utils/masterNotificationsUtils';

const LIST_LIMIT = 20;

/**
 * Demo: skip fetch (GET is allowed server-side, but mark-read is 403 and
 * empty local state avoids noise until booking events exist).
 * Ordinary MASTER only — same eligibility as Stage 2 token registration.
 */
function canFetchMasterNotifications(user: {
  id: number;
  role?: string | null;
  is_demo_session?: boolean | null;
} | null): boolean {
  return canRegisterPushForUser(user);
}

function isCanceled(error: unknown): boolean {
  return isAxiosError(error) && (error.code === 'ERR_CANCELED' || error.name === 'CanceledError');
}

export function useMasterNotifications() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const eligible = !authLoading && isAuthenticated && canFetchMasterNotifications(user);
  const userId = eligible ? user!.id : null;

  const [dataUserId, setDataUserId] = useState<number | null>(userId);
  const [items, setItems] = useState<MasterScheduleNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadReady, setUnreadReady] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<NotificationFetchErrorKind | null>(null);
  const [listLoaded, setListLoaded] = useState(false);

  const generationRef = useRef(0);
  const writeSeqRef = useRef(0);
  const listRequestIdRef = useRef(0);
  const unreadTokenRef = useRef(0);
  const listInFlightRef = useRef(false);
  const markAllInFlightRef = useRef(false);
  const listAbortRef = useRef<AbortController | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const listLoadedRef = useRef(false);

  if (dataUserId !== userId) {
    generationRef.current += 1;
    writeSeqRef.current += 1;
    listRequestIdRef.current += 1;
    unreadTokenRef.current += 1;
    listInFlightRef.current = false;
    markAllInFlightRef.current = false;
    nextCursorRef.current = null;
    listLoadedRef.current = false;
    listAbortRef.current?.abort();
    listAbortRef.current = null;
    setDataUserId(userId);
    setItems([]);
    setUnreadCount(0);
    setUnreadReady(false);
    setNextCursor(null);
    setLoading(false);
    setRefreshing(false);
    setLoadingMore(false);
    setError(null);
    setListLoaded(false);
  }

  const loadUnreadCount = useCallback(async () => {
    if (!eligible || userId == null) return;
    const gen = generationRef.current;
    const token = unreadTokenRef.current;
    try {
      const result = await getNotificationUnreadCount();
      if (gen !== generationRef.current || token !== unreadTokenRef.current) return;
      setUnreadCount(result.unread_count);
      setUnreadReady(true);
    } catch (err) {
      if (gen !== generationRef.current || token !== unreadTokenRef.current || isCanceled(err)) return;
      setUnreadReady(false);
    }
  }, [eligible, userId]);

  const loadList = useCallback(
    async (mode: 'initial' | 'refresh' | 'more'): Promise<boolean> => {
      if (!eligible || userId == null) return false;
      if (mode === 'more') {
        if (listInFlightRef.current || !nextCursorRef.current) return false;
      }

      const gen = generationRef.current;
      if (mode !== 'more') {
        listAbortRef.current?.abort();
        listAbortRef.current = new AbortController();
      }
      const requestId = mode === 'more' ? listRequestIdRef.current : ++listRequestIdRef.current;
      const cursor = mode === 'more' ? nextCursorRef.current : null;
      const signal = mode === 'more' ? undefined : listAbortRef.current?.signal;

      listInFlightRef.current = true;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode === 'more') setLoadingMore(true);
      if (mode === 'initial') setError(null);

      try {
        const result = await getNotifications({
          limit: LIST_LIMIT,
          cursor,
          signal,
        });
        if (gen !== generationRef.current || requestId !== listRequestIdRef.current) return false;
        unreadTokenRef.current += 1;
        const mapped = (result.items ?? []).map(mapBackendNotificationToViewModel);
        setItems((current) => (mode === 'more' ? mergeNotificationPages(current, mapped) : mapped));
        nextCursorRef.current = result.next_cursor ?? null;
        setNextCursor(nextCursorRef.current);
        setUnreadCount(result.unread_count);
        setUnreadReady(true);
        listLoadedRef.current = true;
        setListLoaded(true);
        setError(null);
        return true;
      } catch (err) {
        if (gen !== generationRef.current || requestId !== listRequestIdRef.current || isCanceled(err)) {
          return false;
        }
        const kind = classifyNotificationFetchError(err);
        if (mode === 'initial') {
          setError(kind);
          setUnreadReady(false);
        }
        return false;
      } finally {
        if (gen === generationRef.current && requestId === listRequestIdRef.current) {
          listInFlightRef.current = false;
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [eligible, userId]
  );

  useEffect(() => {
    if (!eligible || userId == null) return;
    void loadUnreadCount();
  }, [eligible, userId, loadUnreadCount]);

  const refresh = useCallback(async () => {
    await loadList(listLoadedRef.current ? 'refresh' : 'initial');
  }, [loadList]);

  const retry = useCallback(async () => {
    await loadList('initial');
  }, [loadList]);

  const loadMore = useCallback(async () => {
    await loadList('more');
  }, [loadList]);

  const ensureListLoaded = useCallback(async () => {
    if (!eligible || userId == null) return;
    if (listLoadedRef.current || listInFlightRef.current) return;
    await loadList('initial');
  }, [eligible, userId, loadList]);

  const markRead = useCallback(async (id: string) => {
    const numericId = parseNotificationId(id);
    if (numericId == null) return;
    const current = items.find((item) => item.id === id);
    if (!current || !current.isUnread) return;

    const op = ++writeSeqRef.current;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isUnread: false } : item)));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await markNotificationRead(numericId);
    } catch {
      if (op !== writeSeqRef.current) return;
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isUnread: true } : item)));
      setUnreadCount((count) => count + 1);
    }
  }, [items]);

  const markAllRead = useCallback(async () => {
    if (unreadCount <= 0) return;
    if (markAllInFlightRef.current) return;
    markAllInFlightRef.current = true;
    const op = ++writeSeqRef.current;
    const snapshotItems = items;
    const snapshotUnread = unreadCount;
    setItems((prev) => prev.map((item) => ({ ...item, isUnread: false })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      if (op !== writeSeqRef.current) return;
      const ok = await loadList('refresh');
      if (op !== writeSeqRef.current) return;
      if (!ok) {
        setItems(snapshotItems);
        setUnreadCount(snapshotUnread);
      }
    } finally {
      markAllInFlightRef.current = false;
    }
  }, [unreadCount, items, loadList]);

  const sections = useMemo(() => groupNotificationsByDate(items), [items]);

  return {
    notifications: items,
    sections,
    unreadCount,
    unreadReady,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore: Boolean(nextCursor),
    listLoaded,
    eligible,
    refresh,
    retry,
    loadMore,
    ensureListLoaded,
    markRead,
    markAllRead,
    usesDevMock: false,
  };
}
