import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
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

  const reconcilePushLifecycle = useCallback(
    async (opts?: { allowEducation?: boolean }) => {
      if (!settled || !canRegisterPushForUser(user)) return;
      const generation = getPushSessionGeneration();
      const permission = await getPushPermissionKind();
      const education = await getPushEducationState();
      if (!isPushSessionCurrent(generation)) return;
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
      if (opts?.allowEducation && decision.action === 'show_education') {
        setEducationVisible(true);
        await setPushEducationState('shown');
      }
    },
    [settled, user, runSilentRegistration]
  );

  useEffect(() => {
    void configurePushNotificationRuntime();
  }, []);

  useEffect(() => {
    if (!settled) {
      setEducationVisible(false);
      return;
    }
    void reconcilePushLifecycle({ allowEducation: true });
  }, [settled, reconcilePushLifecycle]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      if (!shouldRefreshPushOnAppState(previous, next)) return;
      if (!settled || !canRegisterPushForUser(user)) return;
      void reconcilePushLifecycle({ allowEducation: true });
    });
    return () => sub.remove();
  }, [settled, user, reconcilePushLifecycle]);

  useEffect(() => {
    if (typeof Notifications.addPushTokenListener !== 'function') return;
    const sub = Notifications.addPushTokenListener(() => {
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
