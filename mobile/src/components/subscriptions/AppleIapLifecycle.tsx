import { useEffect } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { useAuth } from '@src/auth/AuthContext';
import { appleIapService } from '@src/services/purchases/AppleIapService';
import { IOS_IAP_ENABLED } from '@src/config/iosProductModel';

export function shouldEnableAppleIapLifecycle(
  platform: string,
  isAuthenticated: boolean,
  role: unknown
): boolean {
  const normalizedRole = String(role || '').toLowerCase();
  return (
    IOS_IAP_ENABLED === true &&
    platform === 'ios' &&
    isAuthenticated &&
    (normalizedRole === 'master' || normalizedRole === 'indie')
  );
}

export function AppleIapLifecycle() {
  const { isAuthenticated, user } = useAuth();
  const enabled =
    user != null && shouldEnableAppleIapLifecycle(Platform.OS, isAuthenticated, user.role);

  useEffect(() => {
    if (!enabled || !user) {
      appleIapService.stopAndReset();
      return;
    }

    appleIapService.beginSession(user.id);
    void appleIapService.startTransactionUpdates();
    void appleIapService.runLifecycleSync().catch(() => undefined);

    const subscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') {
          void appleIapService.runLifecycleSync().catch(() => undefined);
        }
      }
    );

    return () => {
      subscription.remove();
      appleIapService.stopAndReset();
    };
  }, [enabled, user?.id]);

  return null;
}
