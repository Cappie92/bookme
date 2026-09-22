import * as Notifications from 'expo-notifications';
import { apiClient } from '@src/services/api/client';
import { acquireExpoPushToken, resolveEasProjectId } from '@src/services/push/expoPushToken';
import {
  __resetInstallationIdentityCacheForTests,
  getOrCreateInstallationId,
} from '@src/services/push/installationIdentity';
import {
  __resetPushRegistrationCacheForTests,
  deactivateCurrentPushInstallation,
  ensurePushRegistrationForAuthenticatedUser,
  refreshPushRegistrationIfNeeded,
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
    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/push/devices',
      expect.objectContaining({
        installation_id: INSTALL_ID,
        token: EXPO_TOKEN,
        provider: 'expo',
        platform: 'ios',
        app_version: '1.0.0',
        build_number: '1',
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
});
