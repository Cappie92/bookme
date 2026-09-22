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

jest.mock('react-native', () => {
  const listeners: Array<(state: string) => void> = [];
  const AppState = {
    currentState: 'active',
    addEventListener: jest.fn((_event: string, cb: (state: string) => void) => {
      listeners.push(cb);
      return {
        remove: jest.fn(() => {
          const index = listeners.indexOf(cb);
          if (index >= 0) listeners.splice(index, 1);
        }),
      };
    }),
    emit(next: string) {
      listeners.slice().forEach((cb) => cb(next));
    },
  };
  (globalThis as { __masterNotificationsAppState?: typeof AppState }).__masterNotificationsAppState = AppState;
  return { Platform: { OS: 'ios' }, AppState };
});

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

async function renderHook(centerVisible = false): Promise<{
  current: ReturnType<typeof useMasterNotifications>;
  rerender: (nextVisible?: boolean) => Promise<void>;
  unmount: () => void;
}> {
  let current: ReturnType<typeof useMasterNotifications> | undefined;
  let visible = centerVisible;
  function Probe({ tick }: { tick: number }) {
    current = useMasterNotifications({ centerVisible: visible });
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
    rerender: async (nextVisible?: boolean) => {
      if (typeof nextVisible === 'boolean') visible = nextVisible;
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
    const AppState = (globalThis as { __masterNotificationsAppState?: { currentState: string } })
      .__masterNotificationsAppState;
    if (AppState) AppState.currentState = 'active';
    (getNotifications as jest.Mock).mockResolvedValue({
      items: [item(1), item(2, 'booking_cancelled')],
      next_cursor: 'next',
      unread_count: 2,
    });
    (getNotificationUnreadCount as jest.Mock).mockResolvedValue({ unread_count: 2 });
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

  it('does not fetch unread-count or expose mark-read on bootstrap', async () => {
    const hook = await renderHook();
    expect(getNotificationUnreadCount).not.toHaveBeenCalled();
    expect(markNotificationRead).not.toHaveBeenCalled();
    expect(markAllNotificationsRead).not.toHaveBeenCalled();
    expect(getNotifications).not.toHaveBeenCalled();
    expect(hook.current).not.toHaveProperty('unreadCount');
    expect(hook.current).not.toHaveProperty('markRead');
    expect(hook.current).not.toHaveProperty('markAllRead');
    hook.unmount();
  });

  it('skips CLIENT, demo, indie and unauthenticated', async () => {
    authState.user = { ...masterA, role: 'client' };
    let hook = await renderHook();
    expect(getNotifications).not.toHaveBeenCalled();
    hook.unmount();

    jest.clearAllMocks();
    authState.user = { ...masterA, is_demo_session: true };
    hook = await renderHook();
    expect(getNotifications).not.toHaveBeenCalled();
    expect(hook.current.notifications).toEqual([]);
    hook.unmount();

    jest.clearAllMocks();
    authState.user = { ...masterA, role: 'indie' };
    hook = await renderHook();
    expect(getNotifications).not.toHaveBeenCalled();
    hook.unmount();

    jest.clearAllMocks();
    authState.user = null;
    authState.isAuthenticated = false;
    hook = await renderHook();
    expect(getNotifications).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('loads empty list without treating it as an error', async () => {
    (getNotifications as jest.Mock).mockResolvedValue({ items: [], next_cursor: null, unread_count: 9 });
    const hook = await renderHook();
    await act(async () => {
      await hook.current.ensureListLoaded();
    });
    expect(hook.current.notifications).toEqual([]);
    expect(hook.current.error).toBeNull();
    expect(getNotificationUnreadCount).not.toHaveBeenCalled();
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
    expect(hook.current.notifications[0]).not.toHaveProperty('isUnread');

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
    expect(getNotificationUnreadCount).not.toHaveBeenCalled();
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
    (getNotifications as jest.Mock).mockResolvedValue({ items: [item(80)], next_cursor: null, unread_count: 0 });
    await hook.rerender();
    expect(hook.current.notifications).toEqual([]);

    resolveFirst({ items: [item(1), item(2)], next_cursor: 'old', unread_count: 8 });
    await act(async () => {
      await firstLoad;
    });
    expect(hook.current.notifications.map((n) => n.id)).not.toEqual(['1', '2']);
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

  it('fetches on center open and refetches when the sheet is opened again', async () => {
    const hook = await renderHook(false);
    expect(getNotifications).not.toHaveBeenCalled();
    await hook.rerender(true);
    expect(getNotifications).toHaveBeenCalledTimes(1);
    (getNotifications as jest.Mock).mockResolvedValue({
      items: [item(9)],
      next_cursor: null,
      unread_count: 1,
    });
    await hook.rerender(false);
    await hook.rerender(true);
    expect(getNotifications).toHaveBeenCalledTimes(2);
    expect(hook.current.notifications.map((n) => n.id)).toEqual(['9']);
    hook.unmount();
  });

  it('refetches on AppState background → active only while the center is visible', async () => {
    const AppState = (
      globalThis as unknown as {
        __masterNotificationsAppState: { currentState: string; emit: (state: string) => void };
      }
    ).__masterNotificationsAppState;
    const hidden = await renderHook(false);
    await act(async () => {
      AppState.currentState = 'background';
      AppState.emit('background');
      AppState.currentState = 'active';
      AppState.emit('active');
    });
    expect(getNotifications).not.toHaveBeenCalled();
    hidden.unmount();

    const visible = await renderHook(true);
    expect(getNotifications).toHaveBeenCalledTimes(1);
    (getNotifications as jest.Mock).mockResolvedValue({
      items: [item(11)],
      next_cursor: null,
      unread_count: 1,
    });
    await act(async () => {
      AppState.currentState = 'background';
      AppState.emit('background');
      AppState.currentState = 'active';
      AppState.emit('active');
    });
    expect(getNotifications).toHaveBeenCalledTimes(2);
    expect(visible.current.notifications.map((n) => n.id)).toEqual(['11']);
    visible.unmount();
  });

  it('keeps manual refresh working after an automatic refetch', async () => {
    const hook = await renderHook(true);
    (getNotifications as jest.Mock).mockResolvedValue({
      items: [item(21)],
      next_cursor: null,
      unread_count: 1,
    });
    await act(async () => {
      await hook.current.refresh();
    });
    expect(hook.current.notifications.map((n) => n.id)).toEqual(['21']);
    hook.unmount();
  });
});
