import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '@src/auth/AuthContext';
import { PushPermissionEducationModal } from '@src/components/push/PushPermissionEducationModal';
import {
  canRegisterPushForUser,
  evaluatePushPermissionUx,
  shouldRefreshPushOnAppState,
} from '@src/services/push/pushEligibility';
import {
  getPushEducationState,
  setPushEducationState,
} from '@src/services/push/pushEducationStorage';
import { getPushPermissionKind, requestPushPermission } from '@src/services/push/pushPermissions';
import {
  ensurePushRegistrationForAuthenticatedUser,
  refreshPushRegistrationIfNeeded,
} from '@src/services/push/pushRegistration';
import { configurePushNotificationRuntime } from '@src/services/push/pushRuntime';
import { getPushSessionGeneration, isPushSessionCurrent } from '@src/services/push/pushSessionGuard';

export function PushRegistrationHost() {
  const { user, token, isAuthenticated, isLoading } = useAuth();
  const [educationVisible, setEducationVisible] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const settled = !isLoading && isAuthenticated && !!token && !!user;

  const runSilentRegistration = useCallback(async () => {
    if (!settled) return;
    await ensurePushRegistrationForAuthenticatedUser({
      user,
      accessToken: token,
      isAuthenticated,
    });
  }, [settled, user, token, isAuthenticated]);

  useEffect(() => {
    void configurePushNotificationRuntime();
  }, []);

  useEffect(() => {
    if (!settled) {
      setEducationVisible(false);
      return;
    }
    const generation = getPushSessionGeneration();
    let cancelled = false;

    void (async () => {
      if (!canRegisterPushForUser(user)) return;
      const permission = await getPushPermissionKind();
      const education = await getPushEducationState();
      if (cancelled || !isPushSessionCurrent(generation)) return;
      const decision = evaluatePushPermissionUx({
        eligible: true,
        permission,
        education,
        foreground: AppState.currentState === 'active',
      });
      if (decision.action === 'register') {
        await runSilentRegistration();
        return;
      }
      if (decision.action === 'show_education') {
        await setPushEducationState('shown');
        if (!cancelled && isPushSessionCurrent(generation)) {
          setEducationVisible(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [settled, user, runSilentRegistration]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      if (!shouldRefreshPushOnAppState(previous, next)) return;
      if (!settled || !canRegisterPushForUser(user)) return;
      void refreshPushRegistrationIfNeeded({
        user,
        accessToken: token,
        isAuthenticated,
      });
    });
    return () => sub.remove();
  }, [settled, user, token, isAuthenticated]);

  const onAllow = async () => {
    const generation = getPushSessionGeneration();
    setEducationVisible(false);
    await setPushEducationState('accepted');
    const permission = await requestPushPermission();
    if (!isPushSessionCurrent(generation)) return;
    if (permission === 'registerable') {
      await runSilentRegistration();
    }
  };

  const onNotNow = async () => {
    setEducationVisible(false);
    await setPushEducationState('dismissed');
  };

  return (
    <PushPermissionEducationModal
      visible={educationVisible}
      onAllow={() => {
        void onAllow();
      }}
      onNotNow={() => {
        void onNotNow();
      }}
    />
  );
}
