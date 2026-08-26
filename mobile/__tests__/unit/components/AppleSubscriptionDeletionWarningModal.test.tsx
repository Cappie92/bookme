import React from 'react';

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
    ActivityIndicator: Mock('ActivityIndicator'),
    Alert: { alert: jest.fn() },
    Modal: Mock('Modal'),
    Text: Mock('Text'),
    TouchableOpacity: Mock('TouchableOpacity'),
    View: Mock('View'),
    StyleSheet: { create: (styles: Record<string, unknown>) => styles },
  };
});

const showManageSubscriptions = jest.fn(async () => undefined);
jest.mock('@src/services/purchases/AppleIapService', () => ({
  appleIapService: { showManageSubscriptions },
}));

const TestRenderer = require('react-test-renderer');
const AppleSubscriptionDeletionWarningModal: React.ComponentType<any> = require(
  '@src/components/AppleSubscriptionDeletionWarningModal'
).AppleSubscriptionDeletionWarningModal;

describe('AppleSubscriptionDeletionWarningModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers management without claiming DeDato cancellation', async () => {
    const onContinueDeletion = jest.fn();
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(AppleSubscriptionDeletionWarningModal, {
          visible: true,
          onCancel: jest.fn(),
          onContinueDeletion,
        })
      );
    });

    const warning = tree.root.findByProps({ testID: 'apple-subscription-deletion-warning' });
    expect(String(warning.props.children)).toContain('не отменяет Apple auto-renewal');

    await TestRenderer.act(async () => {
      await tree.root.findByProps({
        testID: 'account-deletion-manage-apple-subscription',
      }).props.onPress();
    });
    expect(showManageSubscriptions).toHaveBeenCalledTimes(1);
    expect(onContinueDeletion).not.toHaveBeenCalled();
  });

  it('allows immediate continuation and cancellation', () => {
    const onContinueDeletion = jest.fn();
    const onCancel = jest.fn();
    let tree: any;
    TestRenderer.act(() => {
      tree = TestRenderer.create(
        React.createElement(AppleSubscriptionDeletionWarningModal, {
          visible: true,
          onCancel,
          onContinueDeletion,
        })
      );
    });

    TestRenderer.act(() => {
      tree.root.findByProps({ testID: 'account-deletion-continue' }).props.onPress();
      tree.root.findByProps({ testID: 'account-deletion-cancel' }).props.onPress();
    });
    expect(onContinueDeletion).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
