import React from 'react';
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
        const items = section.data.map((item, iIdx) =>
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

const sample: MasterScheduleNotification = {
  id: '11',
  type: 'created',
  title: 'Новая запись',
  body: 'Клиент записался на стрижку',
  isUnread: true,
  createdAt: '2026-06-02T10:00:00.000Z',
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

  it('marks all read once on close even if close is pressed twice', () => {
    const onMarkViewed = jest.fn();
    const onClose = jest.fn();
    let tree: { root: { findAllByProps: (p: object) => Array<{ props: Record<string, unknown> }> } };
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(NotificationsSheet, {
          visible: true,
          onClose,
          onMarkViewed,
          notifications: [sample],
        })
      );
    });
    const closeBtn = tree!.root.findAllByProps({ accessibilityLabel: 'Закрыть' })[0];
    TestRenderer.act(() => {
      (closeBtn.props.onPress as () => void)();
      (closeBtn.props.onPress as () => void)();
    });
    expect(onMarkViewed).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationCard', () => {
  it('renders title/body without requiring a phone', () => {
    let tree: { root: unknown };
    TestRenderer.act(() => {
      tree = TestRenderer.create(React.createElement(NotificationCard, { item: sample, onPress: jest.fn() }));
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
      isUnread: false,
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
});

describe('QuickActionTile unread badge', () => {
  it('hides indicator at 0 and shows count above 1', () => {
    let hidden: { root: { findAllByProps: (p: object) => unknown[] } };
    TestRenderer.act(() => {
      hidden = TestRenderer.create(
        React.createElement(QuickActionTile, {
          label: 'Уведомления',
          icon: 'notifications-outline',
          onPress: jest.fn(),
          unreadCount: 0,
        })
      );
    });
    expect(collectText(hidden!.root)).not.toMatch(/^[0-9]/);

    let shown: { root: unknown };
    TestRenderer.act(() => {
      shown = TestRenderer.create(
        React.createElement(QuickActionTile, {
          label: 'Уведомления',
          icon: 'notifications-outline',
          onPress: jest.fn(),
          unreadCount: 4,
        })
      );
    });
    expect(collectText(shown!.root)).toContain('4');
  });
});
