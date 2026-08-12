import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth, type AuthContextType } from '@src/auth/AuthContext';
import {
  getCurrentUser,
  login as apiLogin,
  register as apiRegister,
} from '@src/services/api/auth';
import {
  clearPendingPhoneVerification,
  getPendingPhoneVerification,
  setPendingPhoneVerification,
  type PendingPhoneVerification,
} from '@src/auth/pendingPhoneVerificationStorage';
import {
  readToken,
  writeRefreshToken,
  writeToken,
} from '@src/auth/tokenStorage';
import { analytics } from '@src/services/analytics';
import { apiClient } from '@src/services/api/client';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

(globalThis as typeof globalThis & { __DEV__: boolean; IS_REACT_ACT_ENVIRONMENT: boolean }).__DEV__ = false;
(globalThis as typeof globalThis & { __DEV__: boolean; IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { act, create } = require('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => { unmount: () => void };
};

jest.mock('@src/services/api/auth', () => ({
  login: jest.fn(),
  register: jest.fn(),
  getCurrentUser: jest.fn(),
  cancelSignupPhoneVerification: jest.fn().mockResolvedValue(undefined),
  isAuthenticatedResponse: (value: any) =>
    !!value?.access_token && !!value?.refresh_token && !!value?.token_type,
  isPhoneVerificationRequiredResponse: (value: any) =>
    value?.status === 'phone_verification_required' &&
    typeof value?.verification_token === 'string' &&
    typeof value?.phone === 'string' &&
    typeof value?.expires_in === 'number',
}));

jest.mock('@src/auth/tokenStorage', () => ({
  AUTH_TOKEN_KEY: 'access_token',
  AUTH_REFRESH_TOKEN_KEY: 'refresh_token',
  AUTH_USER_KEY: 'user_data',
  AUTH_LOGOUT_MARKER: 'auth_logout_marker',
  AUTH_INSTALL_MARKER: 'auth_install_marker_v1',
  clearLogoutMarker: jest.fn().mockResolvedValue(undefined),
  deleteSecureAuthItems: jest.fn().mockResolvedValue(undefined),
  peekSecureToken: jest.fn().mockResolvedValue(null),
  readInstallMarker: jest.fn().mockResolvedValue('installed'),
  readLogoutMarker: jest.fn().mockResolvedValue(null),
  readToken: jest.fn().mockResolvedValue(null),
  setInstallMarker: jest.fn().mockResolvedValue(undefined),
  setLogoutMarker: jest.fn().mockResolvedValue(undefined),
  writeToken: jest.fn().mockResolvedValue(undefined),
  writeRefreshToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@src/auth/pendingPhoneVerificationStorage', () => ({
  getPendingPhoneVerification: jest.fn().mockResolvedValue(null),
  setPendingPhoneVerification: jest.fn().mockResolvedValue(undefined),
  clearPendingPhoneVerification: jest.fn().mockResolvedValue(undefined),
  isPendingPhoneVerificationExpired: (pending: PendingPhoneVerification, now = Date.now()) =>
    pending.expires_at <= now,
}));

jest.mock('@src/utils/subscriptionCache', () => ({
  invalidateSubscriptionCaches: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@src/debug/authRuntimeTrace', () => ({
  authTrace: jest.fn(),
  authTraceDestructive: jest.fn(),
  authTraceStorageSnapshot: jest.fn(),
  authTraceReadTokenHint: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@src/debug/authDiag', () => ({ logAuthDiag: jest.fn() }));
jest.mock('@src/auth/authSessionBridge', () => ({ registerInvalidSessionHandler: jest.fn() }));
jest.mock('@src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('@src/services/analytics', () => ({
  AnalyticsEvent: {
    Logout: 'logout',
    AuthPhoneSuccess: 'auth_phone_success',
    RegistrationCompleted: 'registration_completed',
    RoleSelected: 'role_selected',
  },
  analytics: {
    setUser: jest.fn(),
    clearUser: jest.fn(),
    track: jest.fn(),
  },
}));

const restricted = {
  status: 'phone_verification_required' as const,
  verification_token: 'restricted-token',
  phone: '+79990000001',
  expires_in: 900,
  verification_kind: 'new_registration' as const,
};

const pending: PendingPhoneVerification = {
  verification_token: 'restricted-token',
  phone: '+79990000001',
  expires_at: Date.now() + 900_000,
  origin: 'register',
  registration_role: 'client',
  verification_kind: 'new_registration',
};

const tokens = {
  access_token: 'full-access',
  refresh_token: 'full-refresh',
  token_type: 'bearer',
};

const user = {
  id: 91,
  email: 'user@example.com',
  phone: '+79990000001',
  full_name: 'User',
  role: 'client',
  is_active: true,
  is_verified: false,
  is_phone_verified: true,
  created_at: '2026-08-11T10:00:00Z',
  updated_at: '2026-08-11T10:00:00Z',
};

async function renderAuthContext(): Promise<() => AuthContextType> {
  let current: AuthContextType | undefined;
  function Probe() {
    current = useAuth();
    return null;
  }
  await act(async () => {
    create(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
  });
  for (let attempt = 0; attempt < 20 && current?.isLoading !== false; attempt += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  expect(current?.isLoading).toBe(false);
  return () => {
    if (!current) throw new Error('AuthContext missing');
    return current;
  };
}

describe('AuthContext phone verification lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient as any).defaults.headers = { common: {} };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([]);
    (readToken as jest.Mock).mockResolvedValue(null);
    (getPendingPhoneVerification as jest.Mock).mockResolvedValue(null);
  });

  it.each(['client', 'master'] as const)(
    'stores only pending state after %s registration',
    async (role) => {
      (apiRegister as jest.Mock).mockResolvedValue(restricted);
      const getContext = await renderAuthContext();
      let result: any;

      await act(async () => {
        result = await getContext().register({
          email: `${role}@example.com`,
          phone: restricted.phone,
          password: 'password123',
          full_name: 'User',
          role,
          accept_terms: true,
          accept_personal_data: true,
          ...(role === 'master' ? { city: 'Москва', timezone: 'Europe/Moscow' } : {}),
        });
      });

      expect(result.status).toBe('phone_verification_required');
      expect(setPendingPhoneVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          verification_token: restricted.verification_token,
          phone: restricted.phone,
          origin: 'register',
          verification_kind: 'new_registration',
          registration_role: role,
        })
      );
      expect(writeToken).not.toHaveBeenCalled();
      expect(writeRefreshToken).not.toHaveBeenCalled();
      expect(analytics.track).not.toHaveBeenCalledWith(
        'registration_completed',
        expect.anything()
      );
    }
  );

  it('keeps verified login on the canonical authenticated path', async () => {
    (apiLogin as jest.Mock).mockResolvedValue(tokens);
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    const getContext = await renderAuthContext();
    let result: any;

    await act(async () => {
      result = await getContext().login({ phone: user.phone, password: 'password123' });
    });

    expect(result).toEqual({ status: 'authenticated', user });
    expect(writeToken).toHaveBeenCalledWith('full-access', expect.anything(), 'login');
    expect(writeRefreshToken).toHaveBeenCalledWith('full-refresh', expect.anything());
    expect(getContext().isAuthenticated).toBe(true);
  });

  it('stores pending state for unverified login without normal tokens', async () => {
    (apiLogin as jest.Mock).mockResolvedValue({
      ...restricted,
      verification_kind: 'existing_account',
    });
    const getContext = await renderAuthContext();

    await act(async () => {
      await getContext().login({ phone: user.phone, password: 'password123' });
    });

    expect(getContext().pendingPhoneVerification).toEqual(
      expect.objectContaining({
        origin: 'login',
        verification_token: 'restricted-token',
        verification_kind: 'existing_account',
      })
    );
    expect(writeToken).not.toHaveBeenCalled();
    expect(writeRefreshToken).not.toHaveBeenCalled();
  });

  it('restores valid pending state on restart', async () => {
    (getPendingPhoneVerification as jest.Mock).mockResolvedValue(pending);

    const getContext = await renderAuthContext();

    expect(getContext().pendingPhoneVerification).toEqual(pending);
    expect(getContext().isAuthenticated).toBe(false);
  });

  it('clears expired pending state on restart and requires login', async () => {
    (getPendingPhoneVerification as jest.Mock).mockResolvedValue({
      ...pending,
      expires_at: Date.now() - 1,
    });

    const getContext = await renderAuthContext();

    expect(clearPendingPhoneVerification).toHaveBeenCalled();
    expect(getContext().pendingPhoneVerification).toBeNull();
    expect(getContext().pendingVerificationNeedsLogin).toBe(true);
  });

  it('prefers a valid normal session and removes stale pending state', async () => {
    (getPendingPhoneVerification as jest.Mock).mockResolvedValue(pending);
    (readToken as jest.Mock).mockResolvedValue('existing-access');
    (getCurrentUser as jest.Mock).mockResolvedValue(user);

    const getContext = await renderAuthContext();

    expect(getContext().isAuthenticated).toBe(true);
    expect(getContext().user).toEqual(user);
    expect(clearPendingPhoneVerification).toHaveBeenCalled();
    expect(getContext().pendingPhoneVerification).toBeNull();
  });

  it('hydrates before completing registration analytics and clearing pending', async () => {
    (getPendingPhoneVerification as jest.Mock).mockResolvedValue(pending);
    (getCurrentUser as jest.Mock).mockResolvedValue(user);
    const getContext = await renderAuthContext();

    expect(analytics.track).not.toHaveBeenCalledWith(
      'registration_completed',
      expect.anything()
    );
    await act(async () => {
      await getContext().completePhoneVerification(tokens);
    });

    expect(writeToken).toHaveBeenCalledWith('full-access', expect.anything(), 'register');
    expect(writeRefreshToken).toHaveBeenCalledWith('full-refresh', expect.anything());
    expect(getCurrentUser).toHaveBeenCalled();
    expect(clearPendingPhoneVerification).toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith('registration_completed', {
      authMethod: 'phone',
    });
    expect(getContext().isAuthenticated).toBe(true);
  });

  it('removes full tokens and pending state when post-confirm hydration fails', async () => {
    (getPendingPhoneVerification as jest.Mock).mockResolvedValue(pending);
    (getCurrentUser as jest.Mock).mockRejectedValue(new Error('profile unavailable'));
    const getContext = await renderAuthContext();

    let caught: unknown;
    await act(async () => {
      try {
        await getContext().completePhoneVerification(tokens);
      } catch (error) {
        caught = error;
      }
    });

    expect(caught).toEqual(expect.objectContaining({ message: 'profile unavailable' }));
    expect(clearPendingPhoneVerification).toHaveBeenCalled();
    expect(getContext().token).toBeNull();
    expect(getContext().user).toBeNull();
    expect(getContext().isAuthenticated).toBe(false);
    expect(getContext().pendingVerificationNeedsLogin).toBe(true);
  });

  it('cancel clears pending and leaves no authenticated session', async () => {
    (getPendingPhoneVerification as jest.Mock).mockResolvedValue(pending);
    const getContext = await renderAuthContext();

    await act(async () => {
      await getContext().cancelPendingPhoneVerification();
    });

    expect(clearPendingPhoneVerification).toHaveBeenCalled();
    expect(getContext().pendingPhoneVerification).toBeNull();
    expect(getContext().token).toBeNull();
    expect(getContext().isAuthenticated).toBe(false);
  });
});
