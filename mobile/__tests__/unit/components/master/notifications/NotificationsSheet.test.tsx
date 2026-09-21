import React from 'react';
import fs from 'fs';
import path from 'path';
import type { MasterScheduleNotification } from '@src/components/master/notifications/notificationsTypes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native', () => {
  const ReactLib = require('react');
  const Mock = (tag: string) => {
    const Comp = (props: Record<string, unknown>) =>
      ReactLib.createElement(tag, props, props.children as React.ReactNode);
    Comp.displayName = tag;
    return Comp;
  };
  return {
    Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios ?? spec.default },
    View: Mock('View'),
    Text: Mock('Text'),
    TouchableOpacity: Mock('TouchableOpacity'),
    Modal: Mock('Modal'),
    ActivityIndicator: Mock('ActivityIndicator'),
    RefreshControl: Mock('RefreshControl'),
    ScrollView: Mock('ScrollView'),
    SectionList: (props: Record<string, unknown>) => {
      const sections = (props.sections as Array<{ title: string; data: unknown[] }>) ?? [];
      const children = sections.flatMap((section, sIdx) => {
        const header =
          typeof props.renderSectionHeader === 'function'
            ? (props.renderSectionHeader as (info: { section: typeof section }) => React.ReactNode)({
                section,
              })
            : null;
        const items = section.data.map((item) =>
          typeof props.renderItem === 'function'
            ? (props.renderItem as (info: { item: unknown }) => React.ReactNode)({ item })
            : null
        );
        return [header, ...items].map((child, idx) =>
          ReactLib.createElement(ReactLib.Fragment, { key: `${sIdx}-${idx}` }, child)
        );
      });
      return ReactLib.createElement('SectionList', props, children);
    },
    StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {} },
    useWindowDimensions: () => ({ height: 800, width: 400 }),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactLib = require('react');
  return {
    Ionicons: ({ name }: { name: string }) => ReactLib.createElement('Ionicons', { testID: `icon-${name}`, name }),
  };
});

const TestRenderer = require('react-test-renderer');
const { NotificationsSheet } = require('@src/components/master/notifications/NotificationsSheet') as {
  NotificationsSheet: typeof import('@src/components/master/notifications/NotificationsSheet').NotificationsSheet;
};
const { NotificationCard } = require('@src/components/master/notifications/NotificationCard') as {
  NotificationCard: typeof import('@src/components/master/notifications/NotificationCard').NotificationCard;
};
const { QuickActionTile } = require('@src/components/master/home/QuickActionTile') as {
  QuickActionTile: typeof import('@src/components/master/home/QuickActionTile').QuickActionTile;
};

function collectText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  const inst = node as { props?: { children?: unknown }; children?: unknown[] };
  if (inst.props?.children != null) return collectText(inst.props.children);
  if (Array.isArray(inst.children)) return inst.children.map(collectText).join('');
  return '';
}

function findByTestId(root: { findByProps: (p: object) => { props: Record<string, unknown> } }, testID: string) {
  return root.findByProps({ testID });
}

const created: MasterScheduleNotification = {
  id: '11',
  type: 'created',
  title: 'Новая запись',
  body: 'Клиент записался на стрижку',
  createdAt: '2026-06-02T10:00:00.000Z',
};

const rescheduled: MasterScheduleNotification = {
  id: '12',
  type: 'updated',
  title: 'Запись перенесена',
  body: 'Клиент перенёс окрашивание',
  createdAt: '2026-06-02T09:00:00.000Z',
};

const cancelled: MasterScheduleNotification = {
  id: '13',
  type: 'cancelled',
  title: 'Запись отменена',
  body: 'Клиент отменил укладку',
  createdAt: '2026-06-02T08:00:00.000Z',
};

describe('NotificationsSheet UX', () => {
  it('shows empty copy', () => {
    let tree: { root: { findByProps: (p: object) => { props: Record<string, unknown> } } };
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(NotificationsSheet, {
          visible: true,
          onClose: jest.fn(),
          notifications: [],
        })
      );
    });
    const empty = findByTestId(tree!.root, 'notifications-empty');
    expect(collectText(empty)).toContain('Уведомлений пока нет');
  });

  it('shows loading spinner on first load', () => {
    let tree: { root: { findByProps: (p: object) => { props: Record<string, unknown> } } };
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(NotificationsSheet, {
          visible: true,
          onClose: jest.fn(),
          notifications: [],
          loading: true,
        })
      );
    });
    expect(findByTestId(tree!.root, 'notifications-loading')).toBeTruthy();
  });

  it('shows error with retry and does not use a modal alert', () => {
    const onRetry = jest.fn();
    let tree: { root: { findByProps: (p: object) => { props: Record<string, unknown> } } };
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(NotificationsSheet, {
          visible: true,
          onClose: jest.fn(),
          notifications: [],
          error: 'unavailable',
          onRetry,
        })
      );
    });
    expect(collectText(findByTestId(tree!.root, 'notifications-error'))).toContain(
      'Уведомления пока недоступны'
    );
    TestRenderer.act(() => {
      (findByTestId(tree!.root, 'notifications-retry').props.onPress as () => void)();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('closes without mark-read / mark-all-read UX', () => {
    const onClose = jest.fn();
    let tree: {
      root: { findAllByProps: (p: object) => Array<{ props: Record<string, unknown> }>; findAll: (fn: (n: { props?: Record<string, unknown> }) => boolean) => unknown[] };
    };
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(NotificationsSheet, {
          visible: true,
          onClose,
          notifications: [created, rescheduled, cancelled],
        })
      );
    });
    expect(collectText(tree!.root)).not.toMatch(/Прочитать|прочитан/i);
    const closeBtn = tree!.root.findAllByProps({ accessibilityLabel: 'Закрыть' })[0];
    TestRenderer.act(() => {
      (closeBtn.props.onPress as () => void)();
      (closeBtn.props.onPress as () => void)();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Новые keeps booking_created and hides reschedule/cancel', () => {
    let tree: { root: { findAllByProps: (p: object) => Array<{ props: Record<string, unknown> }>; findAll: (fn: (n: { props?: Record<string, unknown> }) => boolean) => Array<{ props: Record<string, unknown> }> } };
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(NotificationsSheet, {
          visible: true,
          onClose: jest.fn(),
          notifications: [created, rescheduled, cancelled],
        })
      );
    });
    const chip = tree!.root.findAllByProps({ accessibilityLabel: 'Новые' })[0];
    TestRenderer.act(() => {
      (chip.props.onPress as () => void)();
    });
    const list = tree!.root.findAll((n) => Array.isArray(n.props?.sections))[0];
    const ids = ((list.props.sections as Array<{ data: Array<{ id: string; type: string; body: string }> }>) ?? [])
      .flatMap((section) => section.data)
      .map((item) => item.id);
    expect(ids).toEqual(['11']);
    expect(list.props.sections).toBeTruthy();
    const bodies = ((list.props.sections as Array<{ data: Array<{ body: string; type: string }> }>) ?? [])
      .flatMap((section) => section.data);
    expect(bodies.map((item) => item.type)).toEqual(['created']);
    expect(bodies.some((item) => item.body.includes('перенёс'))).toBe(false);
    expect(bodies.some((item) => item.body.includes('отменил'))).toBe(false);
  });

  it('shows type-specific empty copy for Новые', () => {
    let tree: { root: { findByProps: (p: object) => { props: Record<string, unknown> } } };
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(NotificationsSheet, {
          visible: true,
          onClose: jest.fn(),
          notifications: [rescheduled, cancelled],
        })
      );
    });
    const chip = (
      tree!.root as unknown as {
        findAllByProps: (p: object) => Array<{ props: Record<string, unknown> }>;
      }
    ).findAllByProps({ accessibilityLabel: 'Новые' })[0];
    TestRenderer.act(() => {
      (chip.props.onPress as () => void)();
    });
    expect(collectText(findByTestId(tree!.root, 'notifications-empty'))).toContain('Новых записей пока нет');
  });
});

describe('NotificationCard', () => {
  it('renders title/body without requiring a phone', () => {
    let tree: { root: unknown };
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(NotificationCard, { item: created }));
    });
    const text = collectText(tree!.root);
    expect(text).toContain('Новая запись');
    expect(text).toContain('Клиент записался на стрижку');
    expect(text).not.toMatch(/\+7/);
    expect(text.toLowerCase()).not.toContain('телефон');
  });

  it('renders unknown/generic updated type from title/body', () => {
    const item: MasterScheduleNotification = {
      id: '99',
      type: 'updated',
      title: 'Служебное',
      body: 'Текст без телефона',
      createdAt: '2026-06-02T10:00:00.000Z',
    };
    let tree: { root: unknown };
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(NotificationCard, { item }));
    });
    const text = collectText(tree!.root);
    expect(text).toContain('Изменение записи');
    expect(text).toContain('Служебное');
    expect(text).toContain('Текст без телефона');
  });

  it('has no unread dot or mark-read press handler', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../../src/components/master/notifications/NotificationCard.tsx'),
      'utf8'
    );
    expect(src).not.toContain('unreadDot');
    expect(src).not.toContain('isUnread');
    expect(src).not.toContain('cardUnread');
    expect(src).not.toContain('onPress');
  });
});

describe('QuickActionTile has no unread badge', () => {
  it('renders notifications tile without a count badge', () => {
    let tree: { root: unknown };
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(QuickActionTile, {
          label: 'Уведомления',
          icon: 'notifications-outline',
          onPress: jest.fn(),
        })
      );
    });
    expect(collectText(tree!.root)).toContain('Уведомления');
    expect(collectText(tree!.root)).not.toMatch(/\b[1-9]\b/);
    const src = fs.readFileSync(
      path.join(__dirname, '../../../../../src/components/master/home/QuickActionTile.tsx'),
      'utf8'
    );
    expect(src).not.toContain('unreadCount');
    expect(src).not.toContain('unreadDotOnIcon');
  });
});

describe('dashboard does not wire an unread notifications badge', () => {
  it('master home does not pass unreadCount or mark-read handlers', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../../../app/(master)/index.tsx'), 'utf8');
    expect(src).not.toContain('unreadCount');
    expect(src).not.toContain('markRead');
    expect(src).not.toContain('markAllRead');
    expect(src).not.toContain('onMarkViewed');
    expect(src).not.toContain('onPressItem');
  });
});
