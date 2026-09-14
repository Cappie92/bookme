import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { readToken } from '@src/auth/tokenStorage';
import { deactivatePushDevice, registerPushDevice } from '@src/services/api/push';
import { logger } from '@src/utils/logger';
import { acquireExpoPushToken } from './expoPushToken';
import { getOrCreateInstallationId, peekInstallationId } from './installationIdentity';
import { canRegisterPushForUser, type PushAuthUser } from './pushEligibility';
import { getPushPermissionKind } from './pushPermissions';
import {
  getPushRegistrationAbortSignal,
  getPushSessionGeneration,
  isPushSessionCurrent,
} from './pushSessionGuard';

const DEACTIVATE_TIMEOUT_MS = 2500;

export type EnsurePushRegistrationResult =
  | 'skipped'
  | 'registered'
  | 'permission_denied'
  | 'failed';

export type EnsurePushRegistrationInput = {
  user: PushAuthUser | null;
  accessToken?: string | null;
  isAuthenticated: boolean;
};

function pushDiag(message: string): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    logger.debug('auth', `[push] ${message}`);
  }
}

function nativePlatform(): 'ios' | 'android' | null {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
  return null;
}

function runtimeAppVersion(): string | undefined {
  const version = Constants.expoConfig?.version || Constants.nativeAppVersion;
  return typeof version === 'string' && version.trim() ? version.trim() : undefined;
}

function runtimeBuildNumber(): string | undefined {
  if (Platform.OS === 'ios') {
    const build = Constants.expoConfig?.ios?.buildNumber || Constants.nativeBuildVersion;
    return build != null && String(build).trim() ? String(build).trim() : undefined;
  }
  if (Platform.OS === 'android') {
    const code = Constants.expoConfig?.android?.versionCode ?? Constants.nativeBuildVersion;
    return code != null && String(code).trim() ? String(code).trim() : undefined;
  }
  return undefined;
}

function runtimeLocale(): string | undefined {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    return locale?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function runtimeTimezone(): string | undefined {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezone?.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function resolveAccessToken(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit;
  try {
    return (await readToken()) || null;
  } catch {
    return null;
  }
}

export async function ensurePushRegistrationForAuthenticatedUser(
  input: EnsurePushRegistrationInput
): Promise<EnsurePushRegistrationResult> {
  const generation = getPushSessionGeneration();
  const platform = nativePlatform();
  if (!platform) return 'skipped';
  if (!input.isAuthenticated || !canRegisterPushForUser(input.user)) return 'skipped';

  const expectedUserId = input.user!.id;
  const accessToken = await resolveAccessToken(input.accessToken);
  if (!accessToken || !isPushSessionCurrent(generation)) return 'skipped';

  try {
    const permission = await getPushPermissionKind();
    if (!isPushSessionCurrent(generation)) return 'skipped';
    if (permission !== 'registerable') {
      return permission === 'denied' ? 'permission_denied' : 'skipped';
    }

    const installationId = await getOrCreateInstallationId();
    if (!isPushSessionCurrent(generation)) return 'skipped';

    const tokenResult = await acquireExpoPushToken();
    if (!isPushSessionCurrent(generation) || expectedUserId !== input.user?.id) {
      return 'skipped';
    }
    if (!tokenResult.ok) {
      pushDiag(`token_unavailable:${tokenResult.reason}`);
      return 'failed';
    }

    await registerPushDevice(
      {
        installation_id: installationId,
        token: tokenResult.token,
        provider: 'expo',
        platform,
        app_version: runtimeAppVersion(),
        build_number: runtimeBuildNumber(),
        locale: runtimeLocale(),
        timezone: runtimeTimezone(),
      },
      {
        accessToken,
        signal: getPushRegistrationAbortSignal(),
      }
    );
    if (!isPushSessionCurrent(generation)) return 'skipped';
    return 'registered';
  } catch {
    if (!isPushSessionCurrent(generation)) return 'skipped';
    pushDiag('registration_failed');
    return 'failed';
  }
}

export async function refreshPushRegistrationIfNeeded(
  input: EnsurePushRegistrationInput
): Promise<EnsurePushRegistrationResult> {
  return ensurePushRegistrationForAuthenticatedUser(input);
}

/**
 * Best-effort DELETE of the current install row. Must not throw.
 * Call while the outgoing session token is still readable.
 */
export async function deactivateCurrentPushInstallation(): Promise<void> {
  try {
    const accessToken = await resolveAccessToken();
    const installationId = await peekInstallationId();
    if (!accessToken || !installationId) return;
    await deactivatePushDevice(installationId, { accessToken, timeoutMs: DEACTIVATE_TIMEOUT_MS });
  } catch {
    /* 401/404/503/network — logout continues */
  }
}
