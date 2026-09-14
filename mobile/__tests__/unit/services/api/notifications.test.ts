import { apiClient } from '@src/services/api/client';
import {
  getNotificationUnreadCount,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@src/services/api/notifications';

describe('notifications API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults list limit to 20', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { items: [], next_cursor: null, unread_count: 0 },
    });
    await getNotifications();
    expect(apiClient.get).toHaveBeenCalledWith('/api/notifications', {
      params: { limit: 20 },
      signal: undefined,
    });
  });

  it('GETs /api/notifications with limit and optional cursor', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { items: [], next_cursor: 'abc', unread_count: 2 },
    });
    const result = await getNotifications({ limit: 20, cursor: 'c1' });
    expect(apiClient.get).toHaveBeenCalledWith('/api/notifications', {
      params: { limit: 20, cursor: 'c1' },
      signal: undefined,
    });
    expect(result.unread_count).toBe(2);
    expect(result.next_cursor).toBe('abc');
  });

  it('passes unread_only when requested', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: { items: [], next_cursor: null, unread_count: 0 },
    });
    await getNotifications({ unreadOnly: true, limit: 10 });
    expect(apiClient.get).toHaveBeenCalledWith('/api/notifications', {
      params: { limit: 10, unread_only: true },
      signal: undefined,
    });
  });

  it('GETs unread-count', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: { unread_count: 4 } });
    await expect(getNotificationUnreadCount()).resolves.toEqual({ unread_count: 4 });
    expect(apiClient.get).toHaveBeenCalledWith('/api/notifications/unread-count', { signal: undefined });
  });

  it('POSTs mark one read', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: { id: 9, type: 'booking_created', title: 't', body: 'b', created_at: '2026-01-01', read_at: '2026-01-02' },
    });
    await markNotificationRead(9);
    expect(apiClient.post).toHaveBeenCalledWith('/api/notifications/9/read', undefined, { signal: undefined });
  });

  it('POSTs read-all', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ data: { updated_count: 3 } });
    await expect(markAllNotificationsRead()).resolves.toEqual({ updated_count: 3 });
    expect(apiClient.post).toHaveBeenCalledWith('/api/notifications/read-all', undefined, { signal: undefined });
  });

  it('propagates 401 without swallowing', async () => {
    const err = { response: { status: 401 } };
    (apiClient.get as jest.Mock).mockRejectedValue(err);
    await expect(getNotifications()).rejects.toEqual(err);
  });
});
