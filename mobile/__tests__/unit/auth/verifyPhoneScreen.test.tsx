import React from 'react';
import { useAuth } from '@src/auth/AuthContext';
import {
  confirmSignupPhoneVerification,
  requestSignupPhoneVerification,
} from '@src/services/api/auth';
import { getPublicBookingDraft } from '@src/stores/publicBookingDraftStore';

const replace = jest.fn();
const removeBackHandler = jest.fn();

jest.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Alert: { alert: jest.fn() },
  BackHandler: {
    addEventListener: jest.fn(() => ({ remove: removeBackHandler })),
  },
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'ios' },
  StyleSheet: { create: (styles: unknown) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('expo-router', () => ({ router: { replace } }));
jest.mock('@src/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@src/services/api/auth', () => ({
  requestSignupPhoneVerification: jest.fn(),
  confirmSignupPhoneVerification: jest.fn(),
}));
jest.mock('@src/stores/publicBookingDraftStore', () => ({
  getPublicBookingDraft: jest.fn().mockResolvedValue(null),
  isDraftValidForPostLoginRedirect: jest.fn(() => false),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, create } = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => {
    root: {
      findByProps: (props: Record<string, unknown>) => { props: Record<string, any> };
      findAllByType: (type: string) => Array<{ props: Record<string, any> }>;
    };
    unmount: () => void;
  };
};

const pending = {
  verification_token: 'restricted-token',
  phone: '+79990000001',
  expires_at: Date.now() + 900_000,
  origin: 'register' as const,
  registration_role: 'client' as const,
  verification_kind: 'new_registration' as const,
};

const completePhoneVerification = jest.fn();
const cancelPendingPhoneVerification = jest.fn().mockResolvedValue(undefined);
const expirePendingPhoneVerification = jest.fn().mockResolvedValue(undefined);

function renderScreen() {
  // Required after Jest has installed the module mocks above.
  const VerifyPhoneScreen = require('../../../app/verify-phone').default as React.ComponentType;
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(<VerifyPhoneScreen />);
  });
  return renderer!;
}

async function requestCall(renderer: ReturnType<typeof create>) {
  await act(async () => {
    await renderer.root.findByProps({ testID: 'verify-phone-request-call' }).props.onPress();
  });
}

describe('VerifyPhoneScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      pendingPhoneVerification: pending,
      completePhoneVerification,
      cancelPendingPhoneVerification,
      expirePendingPhoneVerification,
    });
    (requestSignupPhoneVerification as jest.Mock).mockResolvedValue({
      success: true,
      message: 'Звонок отправлен',
      call_id: 'call-1',
    });
    (getPublicBookingDraft as jest.Mock).mockResolvedValue(null);
  });

  it('shows the server phone read-only and requests a challenge with only the restricted token', async () => {
    const renderer = renderScreen();

    expect(renderer.root.findByProps({ testID: 'verify-phone-readonly' }).props.children).toBe(
      pending.phone
    );
    expect(renderer.root.findAllByType('TextInput')).toHaveLength(0);

    await requestCall(renderer);

    expect(requestSignupPhoneVerification).toHaveBeenCalledWith('restricted-token');
    expect(renderer.root.findAllByType('TextInput')).toHaveLength(1);
  });

  it('keeps the user on verification with no full session after a wrong code', async () => {
    (confirmSignupPhoneVerification as jest.Mock).mockRejectedValue(
      new Error('Неверные цифры номера телефона')
    );
    const renderer = renderScreen();
    await requestCall(renderer);

    await act(async () => {
      renderer.root.findByProps({ testID: 'verify-phone-digits' }).props.onChangeText('1234');
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: 'verify-phone-confirm' }).props.onPress();
    });

    expect(confirmSignupPhoneVerification).toHaveBeenCalledWith('restricted-token', {
      call_id: 'call-1',
      phone_digits: '1234',
    });
    expect(completePhoneVerification).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: 'verify-phone-error' }).props.children).toBe(
      'Неверные цифры номера телефона'
    );
  });

  it('clears an invalid restricted session and returns to login', async () => {
    (requestSignupPhoneVerification as jest.Mock).mockRejectedValue({
      isAxiosError: true,
      response: { status: 401, data: { detail: 'expired' } },
    });
    const renderer = renderScreen();

    await requestCall(renderer);

    expect(expirePendingPhoneVerification).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/login');
    expect(completePhoneVerification).not.toHaveBeenCalled();
  });

  it('cancels safely, clears pending state and returns to login', async () => {
    const renderer = renderScreen();

    await act(async () => {
      await renderer.root.findByProps({ testID: 'verify-phone-cancel' }).props.onPress();
    });

    expect(cancelPendingPhoneVerification).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/login');
    expect(completePhoneVerification).not.toHaveBeenCalled();
  });

  it('treats Android hardware Back as a safe cancel', async () => {
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
    renderScreen();

    await act(async () => {
      expect(hardwareBack?.()).toBe(true);
      await Promise.resolve();
    });

    expect(cancelPendingPhoneVerification).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/login');
    reactNative.Platform.OS = 'ios';
  });

  it.each([
    { role: 'client', target: '/client/dashboard' },
    { role: 'master', target: '/' },
  ])('hydrates the full session before routing to the $role surface', async ({ role, target }) => {
    const tokens = {
      access_token: 'full-access',
      refresh_token: 'full-refresh',
      token_type: 'bearer',
    };
    (confirmSignupPhoneVerification as jest.Mock).mockResolvedValue(tokens);
    completePhoneVerification.mockResolvedValue({ role });
    const renderer = renderScreen();
    await requestCall(renderer);

    await act(async () => {
      renderer.root.findByProps({ testID: 'verify-phone-digits' }).props.onChangeText('1234');
    });
    await act(async () => {
      await renderer.root.findByProps({ testID: 'verify-phone-confirm' }).props.onPress();
    });

    expect(completePhoneVerification).toHaveBeenCalledWith(tokens);
    expect(replace).toHaveBeenCalledWith(target);
  });
});
