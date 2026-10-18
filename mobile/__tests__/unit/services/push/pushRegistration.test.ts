import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { apiClient } from '@src/services/api/client';
import { acquireExpoPushToken, resolveEasProjectId, __resetExpoPushTokenFlightForTests, EXPO_PUSH_TOKEN_ACQUISITION_TIMEOUT_MS } from '@src/services/push/expoPushToken';
import * as Device from 'expo-device';
import {
  __resetInstallationIdentityCacheForTests,
  getOrCreateInstallationId,
} from '@src/services/push/installationIdentity';
import {
  __resetPushRegistrationCacheForTests,
  deactivateCurrentPushInstallation,
  ensurePushRegistrationForAuthenticatedUser,
  isPushTokenAcquisitionInFlight,
  refreshPushRegistrationIfNeeded,
  registerObservedPushToken,
} from '@src/services/push/pushRegistration';
import { onAuthSessionWillClear } from '@src/services/push/pushAuthBridge';
import { bumpPushSessionGeneration, __resetPushSessionGenerationForTests } from '@src/services/push/pushSessionGuard';
import { readToken } from '@src/auth/tokenStorage';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('@src/auth/tokenStorage', () => ({
  readToken: jest.fn(),
}));

jest.mock('@src/services/push/installationIdentity', () => {
  const actual = jest.requireActual('@src/services/push/installationIdentity');
  return {
    ...actual,
    getOrCreateInstallationId: jest.fn(),
    peekInstallationId: jest.fn(),
  };
});

const master = { id: 10, role: 'master' as const, is_demo_session: false };
const client = { id: 11, role: 'client' as const };
const demoMaster = { id: 12, role: 'master' as const, is_demo_session: true };
const INSTALL_ID = '11111111-2222-4333-8444-555555555555';
const EXPO_TOKEN = 'ExponentPushToken[abcdEF]';

function mockGrantedPermission() {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
    granted: true,
    canAskAgain: true,
  });
}

describe('push registration', () => {
  beforeEach(() => {
    __resetPushSessionGenerationForTests();
    __resetInstallationIdentityCacheForTests();
    __resetPushRegistrationCacheForTests();
    __resetExpoPushTokenFlightForTests();
    (Device as { isDevice: boolean }).isDevice = true;
    jest.clearAllMocks();
    (getOrCreateInstallationId as jest.Mock).mockResolvedValue(INSTALL_ID);
    const identity = jest.requireMock('@src/services/push/installationIdentity') as {
      peekInstallationId: jest.Mock;
    };
    identity.peekInstallationId.mockResolvedValue(INSTALL_ID);
    (readToken as jest.Mock).mockResolvedValue('access-a');
    mockGrantedPermission();
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      type: 'expo',
      data: EXPO_TOKEN,
    });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
    });
    (apiClient.put as jest.Mock).mockResolvedValue({ data: { id: 1, installation_id: INSTALL_ID, is_active: true } });
    (apiClient.delete as jest.Mock).mockResolvedValue({ status: 204 });
  });

  it('sends the Stage 1 payload for ordinary MASTER', async () => {
    const result = await ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'access-a',
      isAuthenticated: true,
    });
    expect(result).toBe('registered');
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/push/devices',
      expect.objectContaining({
        installation_id: INSTALL_ID,
        token: EXPO_TOKEN,
        provider: 'expo',
        platform: 'ios',
        app_version: Constants.expoConfig?.version,
        build_number: String(Constants.expoConfig?.ios?.buildNumber ?? ''),
      }),
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-a' },
      })
    );
    expect(JSON.stringify((apiClient.put as jest.Mock).mock.calls[0][1])).toContain('ExponentPushToken');
  });

  it('does not register CLIENT, ADMIN or demo', async () => {
    await ensurePushRegistrationForAuthenticatedUser({
      user: client,
      accessToken: 't',
      isAuthenticated: true,
    });
    await ensurePushRegistrationForAuthenticatedUser({
      user: { id: 3, role: 'admin' },
      accessToken: 't',
      isAuthenticated: true,
    });
    await ensurePushRegistrationForAuthenticatedUser({
      user: demoMaster,
      accessToken: 't',
      isAuthenticated: true,
    });
    await ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 't',
      isAuthenticated: false,
    });
    expect(apiClient.put).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('does not fetch a token when permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
    });
    const result = await ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'access-a',
      isAuthenticated: true,
    });
    expect(result).toBe('permission_denied');
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('does not fetch a token while permission is still undetermined', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: true,
    });
    const result = await ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'access-a',
      isAuthenticated: true,
    });
    expect(result).toBe('skipped');
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('creates the Android bookings channel before requesting the Expo token', async () => {
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    Platform.OS = 'android';
    await ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'access-a',
      isAuthenticated: true,
    });
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      'bookings',
      expect.objectContaining({ importance: Notifications.AndroidImportance.HIGH })
    );
    const channelOrder = (Notifications.setNotificationChannelAsync as jest.Mock).mock.invocationCallOrder[0];
    const tokenOrder = (Notifications.getExpoPushTokenAsync as jest.Mock).mock.invocationCallOrder[0];
    expect(channelOrder).toBeLessThan(tokenOrder);
    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/push/devices',
      expect.objectContaining({ platform: 'android', token: EXPO_TOKEN }),
      expect.any(Object)
    );
    Platform.OS = 'ios';
  });

  it('treats backend 503 as fail-open', async () => {
    (apiClient.put as jest.Mock).mockRejectedValue({ response: { status: 503 } });
    const result = await ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'access-a',
      isAuthenticated: true,
    });
    expect(result).toBe('failed');
  });

  it('treats backend 404 as fail-open', async () => {
    (apiClient.put as jest.Mock).mockRejectedValue({ response: { status: 404 } });
    await expect(
      ensurePushRegistrationForAuthenticatedUser({
        user: master,
        accessToken: 'access-a',
        isAuthenticated: true,
      })
    ).resolves.toBe('failed');
  });

  it('does not throw on network error', async () => {
    (apiClient.put as jest.Mock).mockRejectedValue(new Error('network'));
    await expect(
      ensurePushRegistrationForAuthenticatedUser({
        user: master,
        accessToken: 'access-a',
        isAuthenticated: true,
      })
    ).resolves.toBe('failed');
  });

  it('skips duplicate PUT when AppState refresh has the same granted token', async () => {
    await ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'access-a',
      isAuthenticated: true,
    });
    await refreshPushRegistrationIfNeeded({
      user: master,
      accessToken: 'access-a',
      isAuthenticated: true,
    });
    expect(apiClient.put).toHaveBeenCalledTimes(1);
    expect((apiClient.put as jest.Mock).mock.calls[0][1].installation_id).toBe(INSTALL_ID);
  });

  it('PUTs again when the Expo token changes', async () => {
    await ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'access-a',
      isAuthenticated: true,
    });
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      type: 'expo',
      data: 'ExponentPushToken[newTok]',
    });
    await refreshPushRegistrationIfNeeded({
      user: master,
      accessToken: 'access-a',
      isAuthenticated: true,
    });
    expect(apiClient.put).toHaveBeenCalledTimes(2);
    expect((apiClient.put as jest.Mock).mock.calls[1][1].token).toBe('ExponentPushToken[newTok]');
  });

  it('discards a late user-A token so it cannot register as user B', async () => {
    let resolveToken: (value: { type: string; data: string }) => void = () => undefined;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveToken = resolve;
        })
    );

    const userA = { id: 1, role: 'master' as const };
    const userB = { id: 2, role: 'master' as const };
    const pendingA = ensurePushRegistrationForAuthenticatedUser({
      user: userA,
      accessToken: 'token-a',
      isAuthenticated: true,
    });

    for (let i = 0; i < 10 && (Notifications.getExpoPushTokenAsync as jest.Mock).mock.calls.length === 0; i += 1) {
      await Promise.resolve();
    }
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalled();
    bumpPushSessionGeneration();

    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      type: 'expo',
      data: 'ExponentPushToken[bbbbBB]',
    });
    const pendingB = ensurePushRegistrationForAuthenticatedUser({
      user: userB,
      accessToken: 'token-b',
      isAuthenticated: true,
    });

    resolveToken({ type: 'expo', data: 'ExponentPushToken[aaaaAA]' });
    const [resultA, resultB] = await Promise.all([pendingA, pendingB]);

    expect(resultA).toBe('skipped');
    expect(resultB).toBe('registered');
    expect(apiClient.put).toHaveBeenCalledTimes(1);
    expect((apiClient.put as jest.Mock).mock.calls[0][2].headers.Authorization).toBe('Bearer token-b');
    expect((apiClient.put as jest.Mock).mock.calls[0][1].token).toBe('ExponentPushToken[bbbbBB]');
  });

  it('deactivates current installation and ignores DELETE failure', async () => {
    (apiClient.delete as jest.Mock).mockRejectedValue({ response: { status: 401 } });
    await expect(deactivateCurrentPushInstallation()).resolves.toBeUndefined();
    expect(apiClient.delete).toHaveBeenCalledWith(
      `/api/push/devices/${INSTALL_ID}`,
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-a' },
      })
    );
  });

  it('rebinds the same installation after logout then login as B', async () => {
    await ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'token-a',
      isAuthenticated: true,
    });
    (apiClient.delete as jest.Mock).mockRejectedValue(new Error('offline'));
    await onAuthSessionWillClear();
    await ensurePushRegistrationForAuthenticatedUser({
      user: { id: 99, role: 'master' },
      accessToken: 'token-b',
      isAuthenticated: true,
    });
    expect(apiClient.delete).toHaveBeenCalled();
    expect((apiClient.put as jest.Mock).mock.calls[1][1].installation_id).toBe(INSTALL_ID);
    expect((apiClient.put as jest.Mock).mock.calls[1][2].headers.Authorization).toBe('Bearer token-b');
  });

  it('AppState refresh skips unauthenticated, CLIENT and demo', async () => {
    await refreshPushRegistrationIfNeeded({ user: master, accessToken: null, isAuthenticated: false });
    await refreshPushRegistrationIfNeeded({ user: client, accessToken: 't', isAuthenticated: true });
    await refreshPushRegistrationIfNeeded({ user: demoMaster, accessToken: 't', isAuthenticated: true });
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('AppState refresh registers granted MASTER', async () => {
    await refreshPushRegistrationIfNeeded({
      user: master,
      accessToken: 'access-a',
      isAuthenticated: true,
    });
    expect(apiClient.put).toHaveBeenCalledTimes(1);
  });

  it('fails safely when projectId is missing', async () => {
    expect(resolveEasProjectId()).toBe('004c94fb-d208-42c6-9baa-1ad147fd3011');
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(acquireExpoPushToken()).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('does not acquire a token or register a backend device on the iOS simulator', async () => {
    (Device as { isDevice: boolean }).isDevice = false;
    const result = await ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'access-a',
      isAuthenticated: true,
    });
    expect(result).toBe('skipped');
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(apiClient.put).not.toHaveBeenCalled();
    await expect(acquireExpoPushToken()).resolves.toEqual({ ok: false, reason: 'simulator' });
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
  });

  it('still acquires a token on Android when Device.isDevice is false', async () => {
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    Platform.OS = 'android';
    (Device as { isDevice: boolean }).isDevice = false;
    try {
      const result = await ensurePushRegistrationForAuthenticatedUser({
        user: master,
        accessToken: 'access-a',
        isAuthenticated: true,
      });
      expect(result).toBe('registered');
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
      expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
      expect(apiClient.put).toHaveBeenCalledWith(
        '/api/push/devices',
        expect.objectContaining({ platform: 'android', token: EXPO_TOKEN }),
        expect.any(Object)
      );
    } finally {
      Platform.OS = 'ios';
    }
  });

  it('shares one native token request across parallel callers', async () => {
    let resolveToken: (value: { type: string; data: string }) => void = () => undefined;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation(
      () => new Promise((resolve) => {
        resolveToken = resolve;
      })
    );
    const first = acquireExpoPushToken();
    const second = acquireExpoPushToken();
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    resolveToken({ type: 'expo', data: EXPO_TOKEN });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true, token: EXPO_TOKEN },
      { ok: true, token: EXPO_TOKEN },
    ]);
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps token acquisition marked in flight until the native request settles', async () => {
    let resolveToken: (value: { type: string; data: string }) => void = () => undefined;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation(
      () => new Promise((resolve) => {
        resolveToken = resolve;
      })
    );
    const pending = ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'access-a',
      isAuthenticated: true,
    });
    for (let i = 0; i < 20 && !isPushTokenAcquisitionInFlight(); i += 1) {
      await Promise.resolve();
    }
    expect(isPushTokenAcquisitionInFlight()).toBe(true);
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    resolveToken({ type: 'expo', data: EXPO_TOKEN });
    await expect(pending).resolves.toBe('registered');
    expect(isPushTokenAcquisitionInFlight()).toBe(false);
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  });

const APNS_TOKEN = 'ab'.repeat(32);
const APNS_TOKEN_LATE = 'cd'.repeat(32);
const FCM_TOKEN = 'fcm-device-token:android-0123456789';
const EXPO_B = 'ExponentPushToken[bbbbBB]';

function grantedInput() {
  return { user: master, accessToken: 'access-a', isAuthenticated: true as const };
}

  it('converts a native listener token and does not send the raw APNs token', async () => {
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation(async (options?: { devicePushToken?: { data?: string } }) => {
      if (options?.devicePushToken) {
        return { type: 'expo', data: EXPO_B };
      }
      return { type: 'expo', data: EXPO_TOKEN };
    });
    await expect(registerObservedPushToken(
      { type: 'ios', data: APNS_TOKEN },
      grantedInput(),
    )).resolves.toBe('registered');
    expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        devicePushToken: { type: 'ios', data: APNS_TOKEN },
      }),
    );
    expect(apiClient.put).toHaveBeenCalledTimes(1);
    expect((apiClient.put as jest.Mock).mock.calls[0][1].token).toBe(EXPO_B);
    expect(JSON.stringify((apiClient.put as jest.Mock).mock.calls[0][1])).not.toContain(APNS_TOKEN);
  });

  it('keeps a native token B that arrives while acquisition A is still pending', async () => {
    let resolveA: (value: { type: string; data: string }) => void = () => undefined;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation((options?: { devicePushToken?: { data?: string } }) => {
      if (options?.devicePushToken) {
        return Promise.resolve({ type: 'expo', data: EXPO_B });
      }
      return new Promise((resolve) => {
        resolveA = resolve;
      });
    });
    const pendingA = ensurePushRegistrationForAuthenticatedUser(grantedInput());
    for (let i = 0; i < 20 && !isPushTokenAcquisitionInFlight(); i += 1) {
      await Promise.resolve();
    }
    const pendingB = registerObservedPushToken({ type: 'ios', data: APNS_TOKEN }, grantedInput());
    resolveA({ type: 'expo', data: EXPO_TOKEN });
    await expect(pendingA).resolves.toBe('registered');
    await expect(pendingB).resolves.toBe('registered');
    expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2);
    expect((apiClient.put as jest.Mock).mock.calls.map((call) => call[1].token)).toEqual([
      EXPO_TOKEN,
      EXPO_B,
    ]);
  });

  it('does not PUT again when a native listener converts to the same Expo token', async () => {
    const input = grantedInput();
    await ensurePushRegistrationForAuthenticatedUser(input);
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockClear();
    (Notifications.getDevicePushTokenAsync as jest.Mock).mockClear();
    (apiClient.put as jest.Mock).mockClear();
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      type: 'expo',
      data: EXPO_TOKEN,
    });
    await expect(registerObservedPushToken(
      { type: 'ios', data: `  ${APNS_TOKEN}  ` },
      input,
    )).resolves.toBe('registered');
    expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith(
      expect.objectContaining({ devicePushToken: { type: 'ios', data: APNS_TOKEN } }),
    );
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('does not PUT again when the in-flight acquire and the listener resolve to one Expo token', async () => {
    let resolveA: (value: { type: string; data: string }) => void = () => undefined;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation((options?: { devicePushToken?: { data?: string } }) => {
      if (options?.devicePushToken) {
        return Promise.resolve({ type: 'expo', data: EXPO_TOKEN });
      }
      return new Promise((resolve) => {
        resolveA = resolve;
      });
    });
    const pending = ensurePushRegistrationForAuthenticatedUser(grantedInput());
    for (let i = 0; i < 20 && !isPushTokenAcquisitionInFlight(); i += 1) {
      await Promise.resolve();
    }
    const repeated = registerObservedPushToken({ type: 'ios', data: APNS_TOKEN }, grantedInput());
    resolveA({ type: 'expo', data: EXPO_TOKEN });
    await expect(pending).resolves.toBe('registered');
    await expect(repeated).resolves.toBe('registered');
    expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(apiClient.put).toHaveBeenCalledTimes(1);
    expect((apiClient.put as jest.Mock).mock.calls[0][1].token).toBe(EXPO_TOKEN);
  });

  it('releases the queue after acquisition timeout and does not start a second native acquire', async () => {
    jest.useFakeTimers();
    try {
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation(
        () => new Promise(() => undefined),
      );
      const pending = ensurePushRegistrationForAuthenticatedUser(grantedInput());
      await jest.advanceTimersByTimeAsync(EXPO_PUSH_TOKEN_ACQUISITION_TIMEOUT_MS);
      await expect(pending).resolves.toBe('failed');
      expect(isPushTokenAcquisitionInFlight()).toBe(false);
      expect(apiClient.put).not.toHaveBeenCalled();

      await expect(ensurePushRegistrationForAuthenticatedUser(grantedInput())).resolves.toBe('failed');
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
      expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
      expect(apiClient.put).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('recovers through a listener token after the initial native acquire never settles', async () => {
    jest.useFakeTimers();
    const staleExpo = 'ExponentPushToken[staleTok]';
    let resolveLate: (value: { type: string; data: string }) => void = () => undefined;
    try {
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation((options?: { devicePushToken?: { data?: string } }) => {
        if (options?.devicePushToken?.data === APNS_TOKEN) {
          return Promise.resolve({ type: 'expo', data: EXPO_B });
        }
        return new Promise((resolve) => {
          resolveLate = resolve;
        });
      });
      const pendingA = ensurePushRegistrationForAuthenticatedUser(grantedInput());
      await jest.advanceTimersByTimeAsync(EXPO_PUSH_TOKEN_ACQUISITION_TIMEOUT_MS);
      await expect(pendingA).resolves.toBe('failed');
      expect(isPushTokenAcquisitionInFlight()).toBe(false);
      expect(apiClient.put).not.toHaveBeenCalled();

      await expect(ensurePushRegistrationForAuthenticatedUser(grantedInput())).resolves.toBe('failed');
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
      expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();

      await expect(registerObservedPushToken(
        { type: 'ios', data: APNS_TOKEN },
        grantedInput(),
      )).resolves.toBe('registered');
      expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          devicePushToken: { type: 'ios', data: APNS_TOKEN },
        }),
      );
      expect((apiClient.put as jest.Mock).mock.calls.map((call) => call[1].token)).toEqual([EXPO_B]);

      resolveLate({ type: 'expo', data: staleExpo });
      await Promise.resolve();
      await Promise.resolve();
      expect(apiClient.put).toHaveBeenCalledTimes(1);
      expect((apiClient.put as jest.Mock).mock.calls[0][1].token).toBe(EXPO_B);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the newest listener Expo token while the old native acquire stays unresolved', async () => {
    jest.useFakeTimers();
    const expoC = 'ExponentPushToken[ccccCC]';
    try {
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation((options?: { devicePushToken?: { data?: string } }) => {
        if (options?.devicePushToken?.data === APNS_TOKEN) {
          return Promise.resolve({ type: 'expo', data: EXPO_B });
        }
        if (options?.devicePushToken?.data === APNS_TOKEN_LATE) {
          return Promise.resolve({ type: 'expo', data: expoC });
        }
        return new Promise(() => undefined);
      });
      const pendingA = ensurePushRegistrationForAuthenticatedUser(grantedInput());
      await jest.advanceTimersByTimeAsync(EXPO_PUSH_TOKEN_ACQUISITION_TIMEOUT_MS);
      await expect(pendingA).resolves.toBe('failed');

      await expect(registerObservedPushToken(
        { type: 'ios', data: APNS_TOKEN },
        grantedInput(),
      )).resolves.toBe('registered');
      await expect(registerObservedPushToken(
        { type: 'ios', data: APNS_TOKEN_LATE },
        grantedInput(),
      )).resolves.toBe('registered');
      await expect(registerObservedPushToken(
        { type: 'ios', data: APNS_TOKEN_LATE },
        grantedInput(),
      )).resolves.toBe('registered');

      expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
      const nativeAcquires = (Notifications.getExpoPushTokenAsync as jest.Mock).mock.calls.filter(
        (call) => !call[0]?.devicePushToken,
      );
      expect(nativeAcquires).toHaveLength(1);
      expect((apiClient.put as jest.Mock).mock.calls.map((call) => call[1].token)).toEqual([EXPO_B, expoC]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('registers a new-session listener while the previous native acquire is still unresolved', async () => {
    jest.useFakeTimers();
    const staleExpo = 'ExponentPushToken[staleTok]';
    let resolveLate: (value: { type: string; data: string }) => void = () => undefined;
    try {
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation((options?: { devicePushToken?: { data?: string } }) => {
        if (options?.devicePushToken) {
          return Promise.resolve({ type: 'expo', data: EXPO_B });
        }
        return new Promise((resolve) => {
          resolveLate = resolve;
        });
      });
      const pendingA = ensurePushRegistrationForAuthenticatedUser({
        user: master,
        accessToken: 'stale-access',
        isAuthenticated: true,
      });
      for (let i = 0; i < 20 && !isPushTokenAcquisitionInFlight(); i += 1) {
        await Promise.resolve();
      }
      const queuedOld = ensurePushRegistrationForAuthenticatedUser({
        user: master,
        accessToken: 'stale-access',
        isAuthenticated: true,
      });
      await jest.advanceTimersByTimeAsync(EXPO_PUSH_TOKEN_ACQUISITION_TIMEOUT_MS);
      await expect(pendingA).resolves.toBe('failed');
      await expect(queuedOld).resolves.toBe('failed');
      expect(apiClient.put).not.toHaveBeenCalled();

      const staleAfterTimeout = ensurePushRegistrationForAuthenticatedUser({
        user: master,
        accessToken: 'stale-access',
        isAuthenticated: true,
      });
      bumpPushSessionGeneration();
      await expect(staleAfterTimeout).resolves.toBe('skipped');
      expect(apiClient.put).not.toHaveBeenCalled();

      await expect(registerObservedPushToken(
        { type: 'ios', data: APNS_TOKEN },
        { user: master, accessToken: 'fresh-access', isAuthenticated: true },
      )).resolves.toBe('registered');
      expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
      expect(apiClient.put).toHaveBeenCalledTimes(1);
      expect((apiClient.put as jest.Mock).mock.calls[0][1].token).toBe(EXPO_B);
      expect((apiClient.put as jest.Mock).mock.calls[0][2].headers.Authorization).toBe('Bearer fresh-access');

      resolveLate({ type: 'expo', data: staleExpo });
      await Promise.resolve();
      await Promise.resolve();
      expect(apiClient.put).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops a registration queued under an older session generation', async () => {
    let resolveA: (value: { type: string; data: string }) => void = () => undefined;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation(
      () => new Promise((resolve) => {
        resolveA = resolve;
      }),
    );
    const pendingA = ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'stale-access',
      isAuthenticated: true,
    });
    for (let i = 0; i < 20 && !isPushTokenAcquisitionInFlight(); i += 1) {
      await Promise.resolve();
    }
    const queued = ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'stale-access',
      isAuthenticated: true,
    });
    bumpPushSessionGeneration();
    resolveA({ type: 'expo', data: EXPO_TOKEN });
    await expect(pendingA).resolves.toBe('skipped');
    await expect(queued).resolves.toBe('skipped');
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('drops a native token event queued before logout', async () => {
    let resolveA: (value: { type: string; data: string }) => void = () => undefined;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation((options?: { devicePushToken?: unknown }) => {
      if (options?.devicePushToken) {
        return Promise.resolve({ type: 'expo', data: EXPO_B });
      }
      return new Promise((resolve) => {
        resolveA = resolve;
      });
    });
    const pendingA = ensurePushRegistrationForAuthenticatedUser({
      user: master,
      accessToken: 'stale-access',
      isAuthenticated: true,
    });
    for (let i = 0; i < 20 && !isPushTokenAcquisitionInFlight(); i += 1) {
      await Promise.resolve();
    }
    const queuedEvent = registerObservedPushToken(
      { type: 'ios', data: APNS_TOKEN },
      { user: master, accessToken: 'stale-access', isAuthenticated: true },
    );
    bumpPushSessionGeneration();
    resolveA({ type: 'expo', data: EXPO_TOKEN });
    await expect(pendingA).resolves.toBe('skipped');
    await expect(queuedEvent).resolves.toBe('skipped');
    expect(apiClient.put).not.toHaveBeenCalled();
    const conversionCalls = (Notifications.getExpoPushTokenAsync as jest.Mock).mock.calls.filter(
      (call) => call[0]?.devicePushToken,
    );
    expect(conversionCalls).toHaveLength(0);
  });

  it('registers on the next attempt after the token API rejects', async () => {
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await expect(ensurePushRegistrationForAuthenticatedUser(grantedInput())).resolves.toBe('failed');
    expect(apiClient.put).not.toHaveBeenCalled();
    expect(isPushTokenAcquisitionInFlight()).toBe(false);

    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      type: 'expo',
      data: EXPO_TOKEN,
    });
    await expect(ensurePushRegistrationForAuthenticatedUser(grantedInput())).resolves.toBe('registered');
    expect(apiClient.put).toHaveBeenCalledTimes(1);
    expect((apiClient.put as jest.Mock).mock.calls[0][1].token).toBe(EXPO_TOKEN);
  });

  it('swallows a late native rejection after timeout', async () => {
    jest.useFakeTimers();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);
    let rejectLate: (reason: Error) => void = () => undefined;
    try {
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockImplementation(
        () => new Promise((_resolve, reject) => {
          rejectLate = reject;
        }),
      );
      const pending = ensurePushRegistrationForAuthenticatedUser(grantedInput());
      await jest.advanceTimersByTimeAsync(EXPO_PUSH_TOKEN_ACQUISITION_TIMEOUT_MS);
      await expect(pending).resolves.toBe('failed');
      rejectLate(new Error('late native rejection'));
      await Promise.resolve();
      await Promise.resolve();
      expect(unhandled).toEqual([]);
      expect(apiClient.put).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', onUnhandled);
      jest.useRealTimers();
    }
  });

  it('converts an Android listener token when Device.isDevice is false', async () => {
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    Platform.OS = 'android';
    (Device as { isDevice: boolean }).isDevice = false;
    (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
      type: 'expo',
      data: EXPO_TOKEN,
    });
    try {
      await expect(registerObservedPushToken(
        { type: 'android', data: FCM_TOKEN },
        grantedInput(),
      )).resolves.toBe('registered');
      expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          devicePushToken: { type: 'android', data: FCM_TOKEN },
        }),
      );
      expect(apiClient.put).toHaveBeenCalledWith(
        '/api/push/devices',
        expect.objectContaining({ platform: 'android', token: EXPO_TOKEN }),
        expect.any(Object),
      );
      expect(JSON.stringify((apiClient.put as jest.Mock).mock.calls[0][1])).not.toContain(FCM_TOKEN);
    } finally {
      Platform.OS = 'ios';
    }
  });
});
