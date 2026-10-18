import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { readToken } from '@src/auth/tokenStorage';
import { deactivatePushDevice, registerPushDevice } from '@src/services/api/push';
import { logger } from '@src/utils/logger';
import {
  acquireExpoPushToken,
  convertNativeDeviceToExpoPushToken,
  readNativeDevicePushToken,
  type NativeDevicePushToken,
} from './expoPushToken';
import { getOrCreateInstallationId, peekInstallationId } from './installationIdentity';
import { canRegisterPushForUser, type PushAuthUser } from './pushEligibility';
import { getPushPermissionKind } from './pushPermissions';
import {
  getPushRegistrationAbortSignal,
  getPushSessionGeneration,
  isPushSessionCurrent,
} from './pushSessionGuard';
import { ensureAndroidBookingsChannel } from './pushRuntime';

const DEACTIVATE_TIMEOUT_MS = 2500;

let lastRegistrationKey: string | null = null;
let registrationChain: Promise<unknown> = Promise.resolve();
let tokenAcquisitionDepth = 0;
let nextOperationId = 0;
let latestCommittedOperationId = 0;

type RegistrationWork = {
  id: number;
  generation: number;
  accessToken: string | null;
  input: EnsurePushRegistrationInput;
  nativeToken: NativeDevicePushToken | null;
};

export function isPushTokenAcquisitionInFlight(): boolean {
  return tokenAcquisitionDepth > 0;
}

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

/**
 * Native listener payload is APNs/FCM. Conversion uses that token and does not
 * consult the native-acquisition slot, so a hung initial acquire cannot block it.
 * The raw native string is never sent to the backend.
 */
export async function registerObservedPushToken(
  payload: unknown,
  input: EnsurePushRegistrationInput
): Promise<EnsurePushRegistrationResult> {
  if (Platform.OS === 'ios' && !Device.isDevice) return 'skipped';
  const nativeToken = readNativeDevicePushToken(payload);
  if (!nativeToken) return 'skipped';
  return enqueuePushRegistration(input, nativeToken);
}

export async function ensurePushRegistrationForAuthenticatedUser(
  input: EnsurePushRegistrationInput
): Promise<EnsurePushRegistrationResult> {
  return enqueuePushRegistration(input, null);
}

function enqueuePushRegistration(
  input: EnsurePushRegistrationInput,
  nativeToken: NativeDevicePushToken | null
): Promise<EnsurePushRegistrationResult> {
  const work: RegistrationWork = {
    id: ++nextOperationId,
    generation: getPushSessionGeneration(),
    accessToken: input.accessToken ?? null,
    input,
    nativeToken,
  };
  const run = () => ensurePushRegistrationUnlocked(work);
  const pending = registrationChain.then(run, run);
  registrationChain = pending.then(
    () => undefined,
    () => undefined
  );
  return pending;
}

async function ensurePushRegistrationUnlocked(
  work: RegistrationWork
): Promise<EnsurePushRegistrationResult> {
  const generation = work.generation;
  if (!isPushSessionCurrent(generation)) return 'skipped';
  const input = work.input;
  const platform = nativePlatform();
  if (!platform) return 'skipped';
  if (!input.isAuthenticated || !canRegisterPushForUser(input.user)) return 'skipped';

  const expectedUserId = input.user!.id;
  const accessToken = work.accessToken || (await resolveAccessToken(null));
  if (!accessToken || !isPushSessionCurrent(generation)) return 'skipped';

  try {
    const permission = await getPushPermissionKind();
    if (!isPushSessionCurrent(generation)) return 'skipped';
    if (permission !== 'registerable') {
      return permission === 'denied' ? 'permission_denied' : 'skipped';
    }

    await ensureAndroidBookingsChannel();
    if (!isPushSessionCurrent(generation)) return 'skipped';

    const installationId = await getOrCreateInstallationId();
    if (!isPushSessionCurrent(generation)) return 'skipped';

    let tokenResult: Awaited<ReturnType<typeof acquireExpoPushToken>>;
    if (work.nativeToken) {
      tokenResult = await convertNativeDeviceToExpoPushToken(work.nativeToken);
    } else {
      tokenAcquisitionDepth += 1;
      try {
        tokenResult = await acquireExpoPushToken();
      } finally {
        tokenAcquisitionDepth -= 1;
      }
    }
    if (!isPushSessionCurrent(generation) || expectedUserId !== input.user?.id) {
      return 'skipped';
    }
    if (!tokenResult.ok) {
      if (tokenResult.reason === 'simulator') return 'skipped';
      pushDiag(`token_unavailable:${tokenResult.reason}`);
      return 'failed';
    }
    if (work.id < latestCommittedOperationId) return 'skipped';

    const registrationKey = `${generation}:${expectedUserId}:${installationId}:${tokenResult.token}`;
    if (lastRegistrationKey === registrationKey) {
      return 'registered';
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
    if (work.id < latestCommittedOperationId) return 'skipped';
    latestCommittedOperationId = work.id;
    lastRegistrationKey = registrationKey;
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

export function __resetPushRegistrationCacheForTests(): void {
  lastRegistrationKey = null;
  registrationChain = Promise.resolve();
  tokenAcquisitionDepth = 0;
  nextOperationId = 0;
  latestCommittedOperationId = 0;
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
