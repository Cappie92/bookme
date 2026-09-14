import { apiClient } from './client';

/**
 * Persistent notification center API (Stage 1 backend).
 * 401 follows the shared apiClient session invalidation — do not suppress it here.
 */

export type BackendNotification = {
  id: number;
  type: string;
  title: string;
  body: string;
  entity_type?: string | null;
  entity_id?: number | null;
  data?: Record<string, unknown> | null;
  read_at?: string | null;
  created_at: string;
};

export type NotificationListResponse = {
  items: BackendNotification[];
  next_cursor: string | null;
  unread_count: number;
};

export type NotificationUnreadCountResponse = {
  unread_count: number;
};

export type NotificationReadAllResponse = {
  updated_count: number;
};

export type GetNotificationsParams = {
  cursor?: string | null;
  limit?: number;
  unreadOnly?: boolean;
  signal?: AbortSignal;
};

const DEFAULT_LIST_LIMIT = 20;

export async function getNotifications(
  params: GetNotificationsParams = {}
): Promise<NotificationListResponse> {
  const query: Record<string, string | number | boolean> = {
    limit: params.limit ?? DEFAULT_LIST_LIMIT,
  };
  if (params.cursor) query.cursor = params.cursor;
  if (params.unreadOnly) query.unread_only = true;
  const response = await apiClient.get<NotificationListResponse>('/api/notifications', {
    params: query,
    signal: params.signal,
  });
  return response.data;
}

export async function getNotificationUnreadCount(opts?: {
  signal?: AbortSignal;
}): Promise<NotificationUnreadCountResponse> {
  const response = await apiClient.get<NotificationUnreadCountResponse>(
    '/api/notifications/unread-count',
    { signal: opts?.signal }
  );
  return response.data;
}

export async function markNotificationRead(
  id: number,
  opts?: { signal?: AbortSignal }
): Promise<BackendNotification> {
  const response = await apiClient.post<BackendNotification>(
    `/api/notifications/${id}/read`,
    undefined,
    { signal: opts?.signal }
  );
  return response.data;
}

export async function markAllNotificationsRead(opts?: {
  signal?: AbortSignal;
}): Promise<NotificationReadAllResponse> {
  const response = await apiClient.post<NotificationReadAllResponse>(
    '/api/notifications/read-all',
    undefined,
    { signal: opts?.signal }
  );
  return response.data;
}
