import React from 'react';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '@src/services/api/client';
import { PushRegistrationHost } from '@src/components/push/PushRegistrationHost';
import { __resetPushSessionGenerationForTests } from '@src/services/push/pushSessionGuard';
import { __resetPushRegistrationCacheForTests } from '@src/services/push/pushRegistration';
import { __resetExpoPushTokenFlightForTests } from '@src/services/push/expoPushToken';
import { __resetPushRuntimeConfiguredForTests } from '@src/services/push/pushRuntime';
import { __resetInstallationIdentityCacheForTests } from '@src/services/push/installationIdentity';
import type { User } from '@src/services/api/auth';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, create } = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => { unmount: () => void; root: { findAllByProps: (props: object) => Array<{ props: Record<string, unknown> }> } };
};

const authState: {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
} = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
};

jest.mock('@src/auth/AuthContext', () => ({
  useAuth: () => authState,
}));

jest.mock('@src/components/push/PushPermissionEducationModal', () => {
  const React = require('react');
  return {
    PushPermissionEducationModal: ({
      visible,
      onAllow,
    }: {
      visible: boolean;
      onAllow: () => void;
    }) =>
      visible
        ? React.createElement('allow-button', {
            testID: 'push-permission-education-allow',
            onPress: onAllow,
          })
        : null,
  };
});

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
  (globalThis as { __pushHostAppState?: typeof AppState }).__pushHostAppState = AppState;
  return { Platform: { OS: 'android' }, AppState };
});

jest.mock('@src/services/push/installationIdentity', () => {
  const actual = jest.requireActual('@src/services/push/installationIdentity');
  return {
    ...actual,
    getOrCreateInstallationId: jest.fn(async () => '11111111-2222-4333-8444-555555555555'),
    peekInstallationId: jest.fn(async () => '11111111-2222-4333-8444-555555555555'),
  };
});

const master: User = {
  id: 10,
  email: 'm@test.com',
  phone: '+79990000001',
  full_name: 'Master',
  role: 'master',
  is_active: true,
  is_verified: true,
  is_demo_session: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

async function flush() {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('PushRegistrationHost permission lifecycle', () => {
  beforeEach(() => {
    __resetPushSessionGenerationForTests();
    __resetPushRegistrationCacheForTests();
    __resetExpoPushTokenFlightForTests();
    __resetPushRuntimeConfiguredForTests();
    __resetInstallationIdentityCacheForTests();
    jest.clearAllMocks();
    authState.user = master;
    authState.token = 'access-a';
    authState.isAuthenticated = true;
    authState.isLoading = false;
    (Device as { isDevice: boolean }).isDevice = true;
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    Platform.OS = 'android';
    (Notifications.addPushTokenListener as jest.Mock).mockImplementation(() => ({ remove: jest.fn() }));
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: true,
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockImplementation(async () => {
      const granted = { status: 'granted', granted: true, canAskAgain: true };
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue(granted);
      return granted;
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      type: 'expo',
      data: 'ExponentPushToken[abcdEF]',
    });
    (apiClient.put as jest.Mock).mockResolvedValue({
      data: { id: 1, installation_id: '11111111-2222-4333-8444-555555555555', is_active: true },
    });
  });

  it('shows education then requests permission and registers after Allow', async () => {
    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(<PushRegistrationHost />);
    });
    await flush();
    const allow = root!.root.findAllByProps({ testID: 'push-permission-education-allow' })[0];
    expect(allow).toBeTruthy();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    await act(async () => {
      (allow.props.onPress as () => void)();
    });
    await flush();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(apiClient.put).toHaveBeenCalledTimes(1);
    await act(async () => {
      root!.unmount();
    });
  });

  it('registers after returning from Settings with permission newly granted', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('dismissed');
    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(<PushRegistrationHost />);
    });
    await flush();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(apiClient.put).not.toHaveBeenCalled();

    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
    });
    const AppState = (globalThis as unknown as { __pushHostAppState: { emit: (state: string) => void } }).__pushHostAppState;
    await act(async () => {
      AppState.emit('background');
      AppState.emit('active');
    });
    await flush();
    expect(apiClient.put).toHaveBeenCalledTimes(1);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    await act(async () => {
      AppState.emit('background');
      AppState.emit('active');
    });
    await flush();
    expect(apiClient.put).toHaveBeenCalledTimes(1);
    await act(async () => {
      root!.unmount();
    });
  });

  it('does not re-prompt or PUT on repeated AppState when still denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('accepted');
    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(<PushRegistrationHost />);
    });
    await flush();
    const AppState = (globalThis as unknown as { __pushHostAppState: { emit: (state: string) => void } }).__pushHostAppState;
    await act(async () => {
      AppState.emit('background');
      AppState.emit('active');
      AppState.emit('background');
      AppState.emit('active');
    });
    await flush();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(apiClient.put).not.toHaveBeenCalled();
    await act(async () => {
      root!.unmount();
    });
  });

  it('does not acquire a token or register a device on the iOS simulator after education', async () => {
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    Platform.OS = 'ios';
    (Device as { isDevice: boolean }).isDevice = false;
    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(<PushRegistrationHost />);
    });
    await flush();
    const allow = root!.root.findAllByProps({ testID: 'push-permission-education-allow' })[0];
    expect(allow).toBeTruthy();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    await act(async () => {
      (allow.props.onPress as () => void)();
    });
    await flush();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(apiClient.put).not.toHaveBeenCalled();
    await act(async () => {
      root!.unmount();
    });
  });

  it('still registers a physical iOS device after education allow', async () => {
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    Platform.OS = 'ios';
    (Device as { isDevice: boolean }).isDevice = true;
    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(<PushRegistrationHost />);
    });
    await flush();
    const allow = root!.root.findAllByProps({ testID: 'push-permission-education-allow' })[0];
    await act(async () => {
      (allow.props.onPress as () => void)();
    });
    await flush();
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    expect(apiClient.put).toHaveBeenCalledTimes(1);
    await act(async () => {
      root!.unmount();
    });
  });

  it('does not request the same Expo token again from a native push-token listener', async () => {
    const nativeToken = 'fcm-device-token:android-0123456789';
    let tokenListener: ((payload: { type: string; data: string }) => void) | null = null;
    (Notifications.addPushTokenListener as jest.Mock).mockImplementation((cb: (payload: { type: string; data: string }) => void) => {
      tokenListener = cb;
      return { remove: jest.fn() };
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: false,
    });
    let release: (value: { type: string; data: string }) => void = () => undefined;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation((options?: { devicePushToken?: { data?: string } }) => {
      if (options?.devicePushToken) {
        return Promise.resolve({ type: 'expo', data: 'ExponentPushToken[abcdEF]' });
      }
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(<PushRegistrationHost />);
    });
    for (let i = 0; i < 20 && (Notifications.getExpoPushTokenAsync as jest.Mock).mock.calls.length === 0; i += 1) {
      await flush();
    }
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    await act(async () => {
      tokenListener?.({ type: 'android', data: nativeToken });
    });
    expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    await act(async () => {
      release({ type: 'expo', data: 'ExponentPushToken[abcdEF]' });
    });
    await flush();
    expect(apiClient.put).toHaveBeenCalledTimes(1);
    expect((apiClient.put as jest.Mock).mock.calls[0][1].token).toBe('ExponentPushToken[abcdEF]');
    await act(async () => {
      root!.unmount();
    });
  });

  it('converts a native listener token that arrives during acquisition', async () => {
    const nativeToken = 'fcm-device-token:android-bbbbbbbbbb';
    const expoB = 'ExponentPushToken[bbbbBB]';
    let tokenListener: ((payload: { type: string; data: string }) => void) | null = null;
    (Notifications.addPushTokenListener as jest.Mock).mockImplementation((cb: (payload: { type: string; data: string }) => void) => {
      tokenListener = cb;
      return { remove: jest.fn() };
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: false,
    });
    let release: (value: { type: string; data: string }) => void = () => undefined;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation((options?: { devicePushToken?: { data?: string } }) => {
      if (options?.devicePushToken) {
        return Promise.resolve({ type: 'expo', data: expoB });
      }
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(<PushRegistrationHost />);
    });
    for (let i = 0; i < 20 && (Notifications.getExpoPushTokenAsync as jest.Mock).mock.calls.length === 0; i += 1) {
      await flush();
    }
    await act(async () => {
      tokenListener?.({ type: 'android', data: nativeToken });
    });
    await act(async () => {
      release({ type: 'expo', data: 'ExponentPushToken[abcdEF]' });
    });
    await flush();
    expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        devicePushToken: { type: 'android', data: nativeToken },
      }),
    );
    expect((apiClient.put as jest.Mock).mock.calls.map((call) => call[1].token)).toEqual([
      'ExponentPushToken[abcdEF]',
      expoB,
    ]);
    expect(JSON.stringify((apiClient.put as jest.Mock).mock.calls)).not.toContain(nativeToken);
    await act(async () => {
      root!.unmount();
    });
  });

  it('removes app-state and push-token listeners on unmount', async () => {
    const tokenRemove = jest.fn();
    (Notifications.addPushTokenListener as jest.Mock).mockImplementation(() => ({ remove: tokenRemove }));
    const AppState = (globalThis as unknown as {
      __pushHostAppState: {
        addEventListener: jest.Mock;
      };
    }).__pushHostAppState;
    const original = AppState.addEventListener.getMockImplementation();
    const appRemove = jest.fn();
    AppState.addEventListener.mockImplementation((event: string, cb: (state: string) => void) => {
      const sub = original?.(event, cb) as { remove: () => void };
      appRemove.mockImplementation(() => sub.remove());
      return { remove: appRemove };
    });
    let root: ReturnType<typeof create>;
    try {
      await act(async () => {
        root = create(<PushRegistrationHost />);
      });
      await act(async () => {
        root!.unmount();
      });
      expect(tokenRemove).toHaveBeenCalledTimes(1);
      expect(appRemove).toHaveBeenCalledTimes(1);
    } finally {
      AppState.addEventListener.mockImplementation(original);
    }
  });
});
