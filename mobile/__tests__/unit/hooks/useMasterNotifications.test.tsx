import React from 'react';
import { AxiosError } from 'axios';
import {
  getNotificationUnreadCount,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@src/services/api/notifications';
import { useMasterNotifications } from '@src/hooks/useMasterNotifications';
import type { User } from '@src/services/api/auth';
import { NOTIFICATIONS_USE_DEV_MOCK } from '@src/components/master/notifications/notificationsMock';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

(globalThis as typeof globalThis & { __DEV__: boolean; IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const { act, create } = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => {
    unmount: () => void;
    update: (element: React.ReactElement) => void;
  };
};

const authState: { user: User | null; isAuthenticated: boolean; isLoading: boolean } = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
};

jest.mock('@src/auth/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
  }),
}));

jest.mock('@src/services/api/notifications', () => ({
  getNotifications: jest.fn(),
  getNotificationUnreadCount: jest.fn(),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

const masterA: User = {
  id: 1,
  email: 'a@test.com',
  phone: '+79990000001',
  full_name: 'Master A',
  role: 'master',
  is_active: true,
  is_verified: true,
  is_demo_session: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const masterB: User = { ...masterA, id: 2, full_name: 'Master B', email: 'b@test.com' };

function item(id: number, type = 'booking_created') {
  return {
    id,
    type,
    title: `Title ${id}`,
    body: `Body ${id}`,
    created_at: `2026-06-02T10:00:0${id}.000Z`,
    read_at: null,
    data: null,
  };
}

function axiosStatus(status: number) {
  const err = new AxiosError('request failed');
  err.response = { status, data: {}, headers: {}, config: {} as never, statusText: 'X' };
  return err;
}

let harnessTick = 0;

function Harness({ tick }: { tick: number }) {
  void tick;
  return null;
}

async function renderHook(): Promise<{
  current: ReturnType<typeof useMasterNotifications>;
  rerender: () => Promise<void>;
  unmount: () => void;
}> {
  let current: ReturnType<typeof useMasterNotifications> | undefined;
  function Probe({ tick }: { tick: number }) {
    current = useMasterNotifications();
    return <Harness tick={tick} />;
  }
  let root: { unmount: () => void; update: (element: React.ReactElement) => void };
  await act(async () => {
    root = create(<Probe tick={harnessTick} />);
  });
  for (let i = 0; i < 20; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  if (!current) throw new Error('hook missing');
  return {
    get current() {
      return current!;
    },
    rerender: async () => {
      harnessTick += 1;
      await act(async () => {
        root.update(<Probe tick={harnessTick} />);
      });
      for (let i = 0; i < 10; i += 1) {
        await act(async () => {
          await Promise.resolve();
        });
      }
    },
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe('useMasterNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    harnessTick = 0;
    authState.user = masterA;
    authState.isAuthenticated = true;
    authState.isLoading = false;
    (getNotificationUnreadCount as jest.Mock).mockResolvedValue({ unread_count: 2 });
    (getNotifications as jest.Mock).mockResolvedValue({
      items: [item(1), item(2, 'booking_cancelled')],
      next_cursor: 'next',
      unread_count: 2,
    });
    (markNotificationRead as jest.Mock).mockResolvedValue(item(1));
    (markAllNotificationsRead as jest.Mock).mockResolvedValue({ updated_count: 2 });
  });

  it('does not use the dev mock list automatically', async () => {
    expect(NOTIFICATIONS_USE_DEV_MOCK).toBe(false);
    const hook = await renderHook();
    expect(hook.current.usesDevMock).toBe(false);
    expect(hook.current.notifications.find((n) => n.id.startsWith('mock-'))).toBeUndefined();
    hook.unmount();
  });

  it('loads unread count on ordinary MASTER bootstrap without blocking', async () => {
    const hook = await renderHook();
    expect(getNotificationUnreadCount).toHaveBeenCalled();
    expect(hook.current.unreadCount).toBe(2);
    expect(hook.current.unreadReady).toBe(true);
    expect(getNotifications).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('skips CLIENT, demo, indie and unauthenticated', async () => {
    authState.user = { ...masterA, role: 'client' };
    let hook = await renderHook();
    expect(getNotificationUnreadCount).not.toHaveBeenCalled();
    hook.unmount();

    jest.clearAllMocks();
    authState.user = { ...masterA, is_demo_session: true };
    hook = await renderHook();
    expect(getNotificationUnreadCount).not.toHaveBeenCalled();
    expect(hook.current.notifications).toEqual([]);
    hook.unmount();

    jest.clearAllMocks();
    authState.user = { ...masterA, role: 'indie' };
    hook = await renderHook();
    expect(getNotificationUnreadCount).not.toHaveBeenCalled();
    hook.unmount();

    jest.clearAllMocks();
    authState.user = null;
    authState.isAuthenticated = false;
    hook = await renderHook();
    expect(getNotificationUnreadCount).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('loads empty list without treating it as an error', async () => {
    (getNotificationUnreadCount as jest.Mock).mockResolvedValue({ unread_count: 0 });
    (getNotifications as jest.Mock).mockResolvedValue({ items: [], next_cursor: null, unread_count: 0 });
    const hook = await renderHook();
    await act(async () => {
      await hook.current.ensureListLoaded();
    });
    expect(hook.current.notifications).toEqual([]);
    expect(hook.current.error).toBeNull();
    expect(hook.current.unreadCount).toBe(0);
    hook.unmount();
  });

  it('loads list, maps types and paginates without duplicate ids', async () => {
    const hook = await renderHook();
    await act(async () => {
      await hook.current.ensureListLoaded();
    });
    expect(hook.current.notifications.map((n) => n.id)).toEqual(['1', '2']);
    expect(hook.current.notifications[0].type).toBe('created');
    expect(hook.current.notifications[1].type).toBe('cancelled');
    expect(hook.current.hasMore).toBe(true);

    (getNotifications as jest.Mock).mockResolvedValue({
      items: [item(2, 'booking_cancelled'), item(3, 'booking_rescheduled')],
      next_cursor: null,
      unread_count: 3,
    });
    await act(async () => {
      await hook.current.loadMore();
    });
    expect(hook.current.notifications.map((n) => n.id)).toEqual(['1', '2', '3']);
    expect(hook.current.notifications[2].type).toBe('updated');
    expect(hook.current.hasMore).toBe(false);
    hook.unmount();
  });

  it('refresh replaces the list', async () => {
    const hook = await renderHook();
    await act(async () => {
      await hook.current.ensureListLoaded();
    });
    (getNotifications as jest.Mock).mockResolvedValue({
      items: [item(9)],
      next_cursor: null,
      unread_count: 1,
    });
    await act(async () => {
      await hook.current.refresh();
    });
    expect(hook.current.notifications.map((n) => n.id)).toEqual(['9']);
    expect(hook.current.unreadCount).toBe(1);
    hook.unmount();
  });

  it('ignores a stale page after a newer refresh', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    (getNotifications as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    const hook = await renderHook();
    let firstLoad: Promise<void> = Promise.resolve();
    await act(async () => {
      firstLoad = hook.current.ensureListLoaded();
    });
    (getNotifications as jest.Mock).mockResolvedValue({
      items: [item(50)],
      next_cursor: null,
      unread_count: 1,
    });
    await act(async () => {
      await hook.current.refresh();
    });
    resolveFirst({ items: [item(1), item(2)], next_cursor: 'old', unread_count: 8 });
    await act(async () => {
      await firstLoad;
    });
    expect(hook.current.notifications.map((n) => n.id)).toEqual(['50']);
    expect(hook.current.unreadCount).toBe(1);
    hook.unmount();
  });

  it('clears previous user items on account switch and drops the old in-flight list', async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    (getNotifications as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        })
    );
    const hook = await renderHook();
    let firstLoad: Promise<void> = Promise.resolve();
    await act(async () => {
      firstLoad = hook.current.ensureListLoaded();
    });

    authState.user = masterB;
    (getNotificationUnreadCount as jest.Mock).mockResolvedValue({ unread_count: 0 });
    (getNotifications as jest.Mock).mockResolvedValue({ items: [item(80)], next_cursor: null, unread_count: 0 });
    await hook.rerender();
    expect(hook.current.notifications).toEqual([]);
    expect(hook.current.unreadCount).toBe(0);

    resolveFirst({ items: [item(1), item(2)], next_cursor: 'old', unread_count: 8 });
    await act(async () => {
      await firstLoad;
    });
    expect(hook.current.notifications.map((n) => n.id)).not.toEqual(['1', '2']);
    expect(hook.current.unreadCount).not.toBe(8);
    hook.unmount();
  });

  it('keeps list on load-more error and retries an initial 404', async () => {
    const hook = await renderHook();
    await act(async () => {
      await hook.current.ensureListLoaded();
    });
    (getNotifications as jest.Mock).mockRejectedValue(new Error('network'));
    await act(async () => {
      await hook.current.loadMore();
    });
    expect(hook.current.notifications).toHaveLength(2);
    expect(hook.current.error).toBeNull();

    (getNotifications as jest.Mock).mockRejectedValue(axiosStatus(404));
    await act(async () => {
      await hook.current.retry();
    });
    expect(hook.current.error).toBe('unavailable');
    expect(hook.current.notifications).toHaveLength(2);

    (getNotifications as jest.Mock).mockResolvedValue({
      items: [item(4)],
      next_cursor: null,
      unread_count: 1,
    });
    await act(async () => {
      await hook.current.retry();
    });
    expect(hook.current.error).toBeNull();
    expect(hook.current.notifications.map((n) => n.id)).toEqual(['4']);
    hook.unmount();
  });

  it('markRead is optimistic, decrements once, and rolls back on failure', async () => {
    const hook = await renderHook();
    await act(async () => {
      await hook.current.ensureListLoaded();
    });
    await act(async () => {
      await hook.current.markRead('1');
    });
    expect(hook.current.notifications[0].isUnread).toBe(false);
    expect(hook.current.unreadCount).toBe(1);
    await act(async () => {
      await hook.current.markRead('1');
    });
    expect(markNotificationRead).toHaveBeenCalledTimes(1);

    (markNotificationRead as jest.Mock).mockRejectedValue(new Error('fail'));
    await act(async () => {
      await hook.current.markRead('2');
    });
    expect(hook.current.notifications[1].isUnread).toBe(true);
    expect(hook.current.unreadCount).toBe(1);
    hook.unmount();
  });

  it('markAllRead posts once, skips when count is already 0, and restores on failure', async () => {
    const hook = await renderHook();
    await act(async () => {
      await hook.current.ensureListLoaded();
    });
    await act(async () => {
      await hook.current.markAllRead();
    });
    expect(hook.current.unreadCount).toBe(0);
    expect(hook.current.notifications.every((n) => !n.isUnread)).toBe(true);
    await act(async () => {
      await hook.current.markAllRead();
    });
    expect(markAllNotificationsRead).toHaveBeenCalledTimes(1);

    (getNotifications as jest.Mock).mockResolvedValue({
      items: [item(1), item(2, 'booking_cancelled')],
      next_cursor: 'next',
      unread_count: 2,
    });
    await act(async () => {
      await hook.current.refresh();
    });
    (markAllNotificationsRead as jest.Mock).mockRejectedValue(new Error('fail'));
    (getNotifications as jest.Mock).mockRejectedValue(new Error('network'));
    await act(async () => {
      await hook.current.markAllRead();
    });
    expect(hook.current.unreadCount).toBe(2);
    expect(hook.current.notifications.some((n) => n.isUnread)).toBe(true);
    hook.unmount();
  });
});
