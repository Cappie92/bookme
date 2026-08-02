import React from 'react';

// react-test-renderer + React 19 in node unit env
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
    View: Mock('View'),
    Text: Mock('Text'),
    TouchableOpacity: Mock('TouchableOpacity'),
    StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  };
});

jest.mock('expo-linking', () => ({
  openURL: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactLib = require('react');
  return {
    Ionicons: ({ name }: { name: string }) =>
      ReactLib.createElement('Ionicons', { testID: `icon-${name}`, name }),
  };
});

jest.mock('@src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRenderer = require('react-test-renderer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RegistrationAgreementRow } = require('@src/components/auth/RegistrationAgreementRow');

function findByTestId(
  root: { findByProps: (p: object) => { props: Record<string, unknown> } },
  testID: string
) {
  return root.findByProps({ testID });
}

describe('RegistrationAgreementRow', () => {
  it('toggles agreement only when checkbox is pressed', () => {
    const onToggle = jest.fn();
    const openURL = jest.fn().mockResolvedValue(undefined);

    let tree: { root: { findByProps: (p: object) => { props: Record<string, unknown> } } };
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(RegistrationAgreementRow, {
          checked: false,
          onToggle,
          openURL,
        })
      );
    });

    TestRenderer.act(() => {
      const onPress = findByTestId(tree!.root, 'agreement-checkbox').props.onPress as () => void;
      onPress();
    });

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('opens user agreement URL without toggling checkbox', async () => {
    const onToggle = jest.fn();
    const openURL = jest.fn().mockResolvedValue(undefined);

    let tree: { root: { findByProps: (p: object) => { props: Record<string, unknown> } } };
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(RegistrationAgreementRow, {
          checked: false,
          onToggle,
          openURL,
        })
      );
    });

    await TestRenderer.act(async () => {
      const onPress = findByTestId(tree!.root, 'user-agreement-link').props.onPress as () => void;
      onPress();
    });

    expect(openURL).toHaveBeenCalledWith('http://localhost:5173/user-agreement');
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('opens personal data consent URL without toggling checkbox', async () => {
    const onToggle = jest.fn();
    const openURL = jest.fn().mockResolvedValue(undefined);

    let tree: { root: { findByProps: (p: object) => { props: Record<string, unknown> } } };
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(RegistrationAgreementRow, {
          checked: true,
          onToggle,
          openURL,
        })
      );
    });

    await TestRenderer.act(async () => {
      const onPress = findByTestId(tree!.root, 'personal-data-consent-link').props
        .onPress as () => void;
      onPress();
    });

    expect(openURL).toHaveBeenCalledWith('http://localhost:5173/personal-data-consent');
    expect(onToggle).not.toHaveBeenCalled();
  });
});
