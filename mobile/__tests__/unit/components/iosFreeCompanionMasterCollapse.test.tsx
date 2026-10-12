import React from 'react';
import {
  IOS_FREE_COMPANION_BODY,
  IOS_FREE_COMPANION_TITLE,
  IOS_MASTER_FREE_FEATURES,
} from '@src/content/iosFreeCompanion';

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
    Platform: { OS: 'ios' },
    View: Mock('View'),
    Text: Mock('Text'),
    TouchableOpacity: Mock('TouchableOpacity'),
    StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  };
});

jest.mock('@expo/vector-icons', () => {
  const ReactLib = require('react');
  return {
    Ionicons: ({ name }: { name: string }) =>
      ReactLib.createElement('Ionicons', { testID: `icon-${name}`, name }),
  };
});

jest.mock('expo-linking', () => ({
  openURL: jest.fn(),
}));

jest.mock('@src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), http: jest.fn() },
}));

const TestRenderer = require('react-test-renderer');
const { IosFreeCompanionNotice } = require('@src/components/ios/IosFreeCompanionNotice');

type Node = {
  props: Record<string, unknown>;
  children: Array<Node | string> | null;
};

function collectText(node: Node | string | null | undefined): string[] {
  if (node == null || typeof node === 'string') {
    return typeof node === 'string' ? [node] : [];
  }
  return (node.children ?? []).flatMap((child) => collectText(child));
}

function renderNotice(variant: 'master' | 'client') {
  let tree: { root: Node & { findByProps: (props: object) => Node } };
  TestRenderer.act(() => {
    tree = TestRenderer.create(React.createElement(IosFreeCompanionNotice, { variant }));
  });
  return tree!;
}

describe('master free companion disclosure', () => {
  it('starts collapsed with the title visible and expands links on tap', () => {
    const tree = renderNotice('master');
    const collapsed = collectText(tree.root).join('\n');

    expect(collapsed).toContain(IOS_FREE_COMPANION_TITLE);
    expect(collapsed).not.toContain(IOS_FREE_COMPANION_BODY);
    expect(collapsed).not.toContain(IOS_MASTER_FREE_FEATURES[0]);
    expect(collapsed).not.toContain('Пользовательское соглашение');
    expect(collapsed).not.toContain('Подробнее о версии для iOS');
    expect(tree.root.findByProps({ testID: 'icon-chevron-down' })).toBeTruthy();
    expect(() => tree.root.findByProps({ testID: 'ios-free-companion-master-details' })).toThrow();

    TestRenderer.act(() => {
      const onPress = tree.root.findByProps({ testID: 'ios-free-companion-master-toggle' }).props
        .onPress as () => void;
      onPress();
    });

    const expanded = collectText(tree.root).join('\n');
    expect(expanded).toContain(IOS_FREE_COMPANION_TITLE);
    expect(expanded).toContain(IOS_FREE_COMPANION_BODY);
    expect(expanded).toContain(IOS_MASTER_FREE_FEATURES[0]);
    expect(tree.root.findByProps({ testID: 'ios-user-agreement-link' })).toBeTruthy();
    expect(tree.root.findByProps({ testID: 'ios-free-companion-link' })).toBeTruthy();
    expect(expanded).toContain('Пользовательское соглашение');
    expect(expanded).toContain('Подробнее о версии для iOS');

    TestRenderer.act(() => {
      const onPress = tree.root.findByProps({ testID: 'ios-free-companion-master-toggle' }).props
        .onPress as () => void;
      onPress();
    });
    expect(collectText(tree.root).join('\n')).not.toContain('Пользовательское соглашение');
  });

  it('keeps the client notice expanded', () => {
    const tree = renderNotice('client');
    const text = collectText(tree.root).join('\n');
    expect(text).toContain(IOS_FREE_COMPANION_TITLE);
    expect(text).toContain('Пользовательское соглашение');
    expect(() => tree.root.findByProps({ testID: 'ios-free-companion-master-toggle' })).toThrow();
  });
});
