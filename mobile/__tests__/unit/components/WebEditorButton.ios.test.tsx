import React from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const linkingReceivers: unknown[] = [];
const mockLinking: { openURL?: jest.Mock } = {};
mockLinking.openURL = jest.fn(function (this: unknown) {
  linkingReceivers.push(this);
  if (this !== mockLinking) {
    throw new TypeError('undefined is not a function');
  }
  return Promise.resolve();
});
const mockAlert = jest.fn();

jest.mock('react-native', () => ({
  Alert: { alert: mockAlert },
  Linking: mockLinking,
  StyleSheet: { create: (styles: Record<string, unknown>) => styles },
}));

jest.mock('@src/components/SecondaryButton', () => {
  const ReactLib = require('react');
  return {
    SecondaryButton: (props: Record<string, unknown>) =>
      ReactLib.createElement('SecondaryButton', props),
  };
});

const mockCreateWebHandoff = jest.fn();
jest.mock('@src/services/api/auth', () => ({
  createWebHandoff: mockCreateWebHandoff,
}));

jest.mock('@src/utils/logger', () => ({
  logger: { error: jest.fn() },
}));

const TestRenderer = require('react-test-renderer');
const { WebEditorButton } = require('@src/components/WebEditorButton.ios');

describe('WebEditorButton iOS browser boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    linkingReceivers.length = 0;
  });

  it.each(['schedule', 'services', 'settings'] as const)(
    'opens the authenticated %s destination with the native Linking receiver intact',
    async (destination) => {
      const url = `https://dedato.ru/auth/mobile-handoff?code=opaque-${destination}`;
      mockCreateWebHandoff.mockResolvedValue({ code: 'opaque', url, expires_in: 60 });
      let tree: any;
      TestRenderer.act(() => {
        tree = TestRenderer.create(
          React.createElement(WebEditorButton, {
            destination,
            title: 'Редактировать в браузере',
            testID: `ios-web-editor-${destination}`,
          })
        );
      });

      await TestRenderer.act(async () => {
        const button = tree.root
          .findAllByProps({ testID: `ios-web-editor-${destination}` })
          .find((node: any) => typeof node.props.onPress === 'function');
        await button.props.onPress();
      });

      expect(mockCreateWebHandoff).toHaveBeenCalledTimes(1);
      expect(mockCreateWebHandoff).toHaveBeenCalledWith('ios_app', destination);
      expect(mockLinking.openURL).toHaveBeenCalledTimes(1);
      expect(mockLinking.openURL).toHaveBeenCalledWith(url);
      expect(linkingReceivers).toEqual([mockLinking]);
      expect(mockAlert).not.toHaveBeenCalled();
    }
  );
});
