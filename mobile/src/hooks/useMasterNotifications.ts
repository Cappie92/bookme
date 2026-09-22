import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { isAxiosError } from 'axios';
import { useAuth } from '@src/auth/AuthContext';
import { getNotifications } from '@src/services/api/notifications';
import { canRegisterPushForUser, shouldRefreshPushOnAppState } from '@src/services/push/pushEligibility';
import {
  classifyNotificationFetchError,
  mapBackendNotificationToViewModel,
  mergeNotificationPages,
  type NotificationFetchErrorKind,
} from '@src/components/master/notifications/masterNotificationsMapper';
import type { MasterScheduleNotification } from '@src/components/master/notifications/notificationsTypes';
import { groupNotificationsByDate } from '@src/utils/masterNotificationsUtils';

const LIST_LIMIT = 20;

/**
 * Demo: skip fetch (empty local state avoids noise until booking events exist).
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

export function useMasterNotifications(options?: { centerVisible?: boolean }) {
  const centerVisible = options?.centerVisible === true;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const eligible = !authLoading && isAuthenticated && canFetchMasterNotifications(user);
  const userId = eligible ? user!.id : null;

  const [dataUserId, setDataUserId] = useState<number | null>(userId);
  const [items, setItems] = useState<MasterScheduleNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<NotificationFetchErrorKind | null>(null);
  const [listLoaded, setListLoaded] = useState(false);

  const generationRef = useRef(0);
  const listRequestIdRef = useRef(0);
  const listInFlightRef = useRef(false);
  const listAbortRef = useRef<AbortController | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const listLoadedRef = useRef(false);

  if (dataUserId !== userId) {
    generationRef.current += 1;
    listRequestIdRef.current += 1;
    listInFlightRef.current = false;
    nextCursorRef.current = null;
    listLoadedRef.current = false;
    listAbortRef.current?.abort();
    listAbortRef.current = null;
    setDataUserId(userId);
    setItems([]);
    setNextCursor(null);
    setLoading(false);
    setRefreshing(false);
    setLoadingMore(false);
    setError(null);
    setListLoaded(false);
  }

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
        const mapped = (result.items ?? []).map(mapBackendNotificationToViewModel);
        setItems((current) => (mode === 'more' ? mergeNotificationPages(current, mapped) : mapped));
        nextCursorRef.current = result.next_cursor ?? null;
        setNextCursor(nextCursorRef.current);
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

  useEffect(() => {
    if (!eligible || !centerVisible) return;
    void loadList(listLoadedRef.current ? 'refresh' : 'initial');
  }, [centerVisible, eligible, loadList]);

  useEffect(() => {
    const appStateRef = { current: AppState.currentState as AppStateStatus };
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      if (!centerVisible || !eligible) return;
      if (!shouldRefreshPushOnAppState(previous, next)) return;
      void loadList(listLoadedRef.current ? 'refresh' : 'initial');
    });
    return () => sub.remove();
  }, [centerVisible, eligible, loadList]);

  const sections = useMemo(() => groupNotificationsByDate(items), [items]);

  return {
    notifications: items,
    sections,
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
    usesDevMock: false,
  };
}
