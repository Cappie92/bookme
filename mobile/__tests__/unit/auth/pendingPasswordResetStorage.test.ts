import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  PENDING_PASSWORD_RESET_KEY,
  clearPendingPasswordReset,
  getPendingPasswordReset,
  isPendingPasswordResetExpired,
  setPendingPasswordReset,
  type PendingPasswordReset,
} from '@src/auth/pendingPasswordResetStorage';
import { AUTH_REFRESH_TOKEN_KEY, AUTH_TOKEN_KEY } from '@src/auth/tokenStorage';

const verification: PendingPasswordReset = {
  stage: 'verification',
  phone: '+79990000001',
  challenge_token: 'challenge-token',
  call_id: 'call-id',
  expires_at: 2_000,
};

describe('pendingPasswordResetStorage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses a dedicated key and persists no digits or passwords', async () => {
    expect(PENDING_PASSWORD_RESET_KEY).not.toBe(AUTH_TOKEN_KEY);
    expect(PENDING_PASSWORD_RESET_KEY).not.toBe(AUTH_REFRESH_TOKEN_KEY);

    await setPendingPasswordReset(verification);

    const serialized = JSON.stringify(verification);
    expect(serialized).not.toContain('phone_digits');
    expect(serialized).not.toContain('password');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(PENDING_PASSWORD_RESET_KEY, serialized);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(PENDING_PASSWORD_RESET_KEY, serialized);
  });

  it.each([
    verification,
    { stage: 'new_password', reset_token: 'reset-token', expires_at: 3_000 } as const,
  ])('restores the valid $stage stage after restart', async (pending) => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(pending));
    await expect(getPendingPasswordReset()).resolves.toEqual(pending);
  });

  it('classifies expiry deterministically', () => {
    expect(isPendingPasswordResetExpired(verification, 1_999)).toBe(false);
    expect(isPendingPasswordResetExpired(verification, 2_000)).toBe(true);
  });

  it('clears secure and fallback storage', async () => {
    await clearPendingPasswordReset();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(PENDING_PASSWORD_RESET_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(PENDING_PASSWORD_RESET_KEY);
  });
});
