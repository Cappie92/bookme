import React, { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import {
  clearPendingPasswordReset,
  getPendingPasswordReset,
  isPendingPasswordResetExpired,
  setPendingPasswordReset,
  type PendingPasswordReset,
} from './pendingPasswordResetStorage';
import type {
  ConfirmPasswordResetPhoneResponse,
  RequestPasswordResetPhoneResponse,
} from '@src/services/api/auth';
import { useAuth } from './AuthContext';

interface PasswordResetRecoveryContextValue {
  pendingPasswordReset: PendingPasswordReset | null;
  passwordResetNeedsLogin: boolean;
  isPasswordResetLoading: boolean;
  beginPhonePasswordReset: (
    phone: string,
    response: RequestPasswordResetPhoneResponse
  ) => Promise<void>;
  acceptPasswordResetToken: (response: ConfirmPasswordResetPhoneResponse) => Promise<void>;
  cancelPasswordReset: () => Promise<void>;
  expirePasswordReset: () => Promise<void>;
  finishPasswordReset: () => Promise<void>;
}

const PasswordResetRecoveryContext = createContext<PasswordResetRecoveryContextValue | undefined>(
  undefined
);

export function PasswordResetRecoveryProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [pendingPasswordReset, setPendingState] = useState<PendingPasswordReset | null>(null);
  const [passwordResetNeedsLogin, setNeedsLogin] = useState(false);
  const [isPasswordResetLoading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await getPendingPasswordReset();
      if (!active) return;
      if (stored && isPendingPasswordResetExpired(stored)) {
        await clearPendingPasswordReset();
        if (!active) return;
        setNeedsLogin(true);
      } else {
        setPendingState(stored);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void clearPendingPasswordReset();
    setPendingState(null);
    setNeedsLogin(false);
  }, [isAuthenticated]);

  const beginPhonePasswordReset = useCallback(
    async (phone: string, response: RequestPasswordResetPhoneResponse) => {
      const pending: PendingPasswordReset = {
        stage: 'verification',
        phone,
        challenge_token: response.challenge_token,
        call_id: response.call_id,
        expires_at: Date.now() + response.expires_in * 1000,
      };
      await setPendingPasswordReset(pending);
      setPendingState(pending);
      setNeedsLogin(false);
    },
    []
  );

  const acceptPasswordResetToken = useCallback(
    async (response: ConfirmPasswordResetPhoneResponse) => {
      const pending: PendingPasswordReset = {
        stage: 'new_password',
        reset_token: response.reset_token,
        expires_at: Date.now() + response.expires_in * 1000,
      };
      await setPendingPasswordReset(pending);
      setPendingState(pending);
      setNeedsLogin(false);
    },
    []
  );

  const cancelPasswordReset = useCallback(async () => {
    await clearPendingPasswordReset();
    setPendingState(null);
    setNeedsLogin(false);
  }, []);

  const expirePasswordReset = useCallback(async () => {
    await clearPendingPasswordReset();
    setPendingState(null);
    setNeedsLogin(true);
  }, []);

  const finishPasswordReset = useCallback(async () => {
    await clearPendingPasswordReset();
    setPendingState(null);
    setNeedsLogin(true);
  }, []);

  return (
    <PasswordResetRecoveryContext.Provider
      value={{
        pendingPasswordReset,
        passwordResetNeedsLogin,
        isPasswordResetLoading,
        beginPhonePasswordReset,
        acceptPasswordResetToken,
        cancelPasswordReset,
        expirePasswordReset,
        finishPasswordReset,
      }}
    >
      {children}
    </PasswordResetRecoveryContext.Provider>
  );
}

export function usePasswordResetRecovery(): PasswordResetRecoveryContextValue {
  const context = useContext(PasswordResetRecoveryContext);
  if (!context) {
    throw new Error('usePasswordResetRecovery must be used inside PasswordResetRecoveryProvider');
  }
  return context;
}
