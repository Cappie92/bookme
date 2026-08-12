import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { usePasswordResetRecovery } from '@src/auth/PasswordResetRecoveryContext';
import {
  confirmPasswordResetPhone,
  requestPasswordResetPhone,
  resetPassword,
} from '@src/services/api/auth';

const replace = jest.fn();
const push = jest.fn();
const removeBackHandler = jest.fn();

jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Alert: { alert: jest.fn() },
  BackHandler: { addEventListener: jest.fn(() => ({ remove: removeBackHandler })) },
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'ios' },
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-router', () => ({ router: { replace, push } }));
jest.mock('@src/components/ui/PasswordInput', () => ({ PasswordInput: 'PasswordInput' }));
jest.mock('@src/auth/PasswordResetRecoveryContext', () => ({
  usePasswordResetRecovery: jest.fn(),
}));
jest.mock('@src/services/api/auth', () => ({
  requestPasswordResetPhone: jest.fn(),
  confirmPasswordResetPhone: jest.fn(),
  resetPassword: jest.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, create } = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => {
    root: { findByProps: (props: Record<string, unknown>) => { props: Record<string, any> } };
  };
};

const beginPhonePasswordReset = jest.fn().mockResolvedValue(undefined);
const acceptPasswordResetToken = jest.fn().mockResolvedValue(undefined);
const cancelPasswordReset = jest.fn().mockResolvedValue(undefined);
const expirePasswordReset = jest.fn().mockResolvedValue(undefined);
const finishPasswordReset = jest.fn().mockResolvedValue(undefined);

const verificationPending = {
  stage: 'verification' as const,
  phone: '+79991234567',
  challenge_token: 'challenge-token',
  call_id: 'call-id',
  expires_at: Date.now() + 300_000,
};
const resetPending = {
  stage: 'new_password' as const,
  reset_token: 'reset-token',
  expires_at: Date.now() + 900_000,
};

function recoveryValue(pendingPasswordReset: typeof verificationPending | typeof resetPending | null) {
  return {
    pendingPasswordReset,
    passwordResetNeedsLogin: false,
    isPasswordResetLoading: false,
    beginPhonePasswordReset,
    acceptPasswordResetToken,
    cancelPasswordReset,
    expirePasswordReset,
    finishPasswordReset,
  };
}

function render(modulePath: string) {
  const Screen = require(modulePath).default as React.ComponentType;
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(<Screen />);
  });
  return renderer!;
}

describe('password reset mobile screens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePasswordResetRecovery as jest.Mock).mockReturnValue(recoveryValue(null));
  });

  it('keeps a Forgot Password action on the shared login screen', () => {
    const source = readFileSync(join(__dirname, '../../../app/login.tsx'), 'utf8');
    expect(source).toContain('testID="forgot-password-button"');
    expect(source).toContain("router.push('/forgot-password')");
  });

  it('opens recovery at phone entry and advances only after request state is stored', async () => {
    const response = {
      status: 'verification_required',
      message: 'generic',
      challenge_token: 'challenge-token',
      call_id: 'call-id',
      expires_in: 300,
    };
    (requestPasswordResetPhone as jest.Mock).mockResolvedValue(response);
    const renderer = render('../../../app/forgot-password');

    expect(renderer.root.findByProps({ testID: 'password-reset-phone' })).toBeTruthy();
    await act(async () => {
      renderer.root.findByProps({ testID: 'password-reset-phone' }).props.onChangeText(
        '8 (999) 123-45-67'
      );
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: 'password-reset-request' }).props.onPress();
    });

    expect(requestPasswordResetPhone).toHaveBeenCalledWith('+79991234567');
    expect(beginPhonePasswordReset).toHaveBeenCalledWith('+79991234567', response);
    expect(replace).toHaveBeenCalledWith('/password-reset-verify');
  });

  it('keeps a wrong code inside recovery without accepting a reset token', async () => {
    (usePasswordResetRecovery as jest.Mock).mockReturnValue(recoveryValue(verificationPending));
    (confirmPasswordResetPhone as jest.Mock).mockRejectedValue(new Error('wrong'));
    const renderer = render('../../../app/password-reset-verify');

    await act(async () => {
      renderer.root.findByProps({ testID: 'password-reset-digits' }).props.onChangeText('1234');
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: 'password-reset-confirm' }).props.onPress();
    });

    expect(acceptPasswordResetToken).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalledWith('/reset-password');
    expect(renderer.root.findByProps({ testID: 'password-reset-confirm-error' })).toBeTruthy();
  });

  it('stores a successful confirm response before opening new-password', async () => {
    const response = { status: 'reset_token_issued', reset_token: 'reset-token', expires_in: 900 };
    (usePasswordResetRecovery as jest.Mock).mockReturnValue(recoveryValue(verificationPending));
    (confirmPasswordResetPhone as jest.Mock).mockResolvedValue(response);
    const renderer = render('../../../app/password-reset-verify');

    await act(async () => {
      renderer.root.findByProps({ testID: 'password-reset-digits' }).props.onChangeText('1234');
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: 'password-reset-confirm' }).props.onPress();
    });

    expect(acceptPasswordResetToken).toHaveBeenCalledWith(response);
    expect(replace).toHaveBeenCalledWith('/reset-password');
  });

  it('blocks password mismatch without calling backend', async () => {
    (usePasswordResetRecovery as jest.Mock).mockReturnValue(recoveryValue(resetPending));
    const renderer = render('../../../app/reset-password');

    await act(async () => {
      renderer.root.findByProps({ testID: 'password-reset-new-password' }).props.onChangeText('newpassword');
      renderer.root.findByProps({ testID: 'password-reset-confirm-password' }).props.onChangeText('different');
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: 'password-reset-submit' }).props.onPress();
    });

    expect(resetPassword).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: 'password-reset-password-error' }).props.children).toBe('Пароли не совпадают');
  });

  it('finishes without creating auth state and returns to login', async () => {
    (usePasswordResetRecovery as jest.Mock).mockReturnValue(recoveryValue(resetPending));
    (resetPassword as jest.Mock).mockResolvedValue({ success: true, message: 'ok' });
    const renderer = render('../../../app/reset-password');

    await act(async () => {
      renderer.root.findByProps({ testID: 'password-reset-new-password' }).props.onChangeText('newpassword');
      renderer.root.findByProps({ testID: 'password-reset-confirm-password' }).props.onChangeText('newpassword');
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: 'password-reset-submit' }).props.onPress();
    });

    expect(resetPassword).toHaveBeenCalledWith('reset-token', 'newpassword');
    expect(finishPasswordReset).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('treats Android hardware Back as cancel and returns to login', async () => {
    const reactNative = require('react-native') as {
      Platform: { OS: string };
      BackHandler: { addEventListener: jest.Mock };
    };
    let hardwareBack: (() => boolean) | undefined;
    reactNative.Platform.OS = 'android';
    reactNative.BackHandler.addEventListener.mockImplementation(
      (_event: string, handler: () => boolean) => {
        hardwareBack = handler;
        return { remove: removeBackHandler };
      }
    );
    render('../../../app/forgot-password');

    await act(async () => {
      expect(hardwareBack?.()).toBe(true);
      await Promise.resolve();
    });

    expect(cancelPasswordReset).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/login');
    reactNative.Platform.OS = 'ios';
  });
});
