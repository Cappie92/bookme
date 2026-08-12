import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  PENDING_PHONE_VERIFICATION_KEY,
  clearPendingPhoneVerification,
  getPendingPhoneVerification,
  isPendingPhoneVerificationExpired,
  setPendingPhoneVerification,
  type PendingPhoneVerification,
} from '@src/auth/pendingPhoneVerificationStorage';
import { AUTH_REFRESH_TOKEN_KEY, AUTH_TOKEN_KEY } from '@src/auth/tokenStorage';

const pending: PendingPhoneVerification = {
  verification_token: 'restricted-token',
  phone: '+79990000001',
  expires_at: 2_000,
  origin: 'register',
  registration_role: 'client',
  verification_kind: 'new_registration',
};

describe('pendingPhoneVerificationStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a dedicated key and never aliases normal access/refresh storage', () => {
    expect(PENDING_PHONE_VERIFICATION_KEY).not.toBe(AUTH_TOKEN_KEY);
    expect(PENDING_PHONE_VERIFICATION_KEY).not.toBe(AUTH_REFRESH_TOKEN_KEY);
  });

  it('persists pending verification separately in secure and fallback storage', async () => {
    await setPendingPhoneVerification(pending);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      PENDING_PHONE_VERIFICATION_KEY,
      JSON.stringify(pending)
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      PENDING_PHONE_VERIFICATION_KEY,
      JSON.stringify(pending)
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(AUTH_TOKEN_KEY, expect.anything());
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      AUTH_REFRESH_TOKEN_KEY,
      expect.anything()
    );
  });

  it('restores a valid pending state after restart', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(pending));

    await expect(getPendingPhoneVerification()).resolves.toEqual(pending);
  });

  it('classifies local expiry deterministically', () => {
    expect(isPendingPhoneVerificationExpired(pending, 1_999)).toBe(false);
    expect(isPendingPhoneVerificationExpired(pending, 2_000)).toBe(true);
  });

  it('clears both storage branches', async () => {
    await clearPendingPhoneVerification();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(PENDING_PHONE_VERIFICATION_KEY);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(PENDING_PHONE_VERIFICATION_KEY);
  });
});
