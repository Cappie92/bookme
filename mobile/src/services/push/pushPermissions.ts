import * as Notifications from 'expo-notifications';

import type { PushPermissionKind } from './pushEligibility';

/**
 * iOS semantics (Expo SDK 54):
 * - AUTHORIZED → registerable
 * - PROVISIONAL → Quiet Delivery; OS still delivers, treat as registerable
 * - EPHEMERAL → App Clip-style temporary grant; treat as registerable while valid
 * - NOT_DETERMINED → education + system prompt path
 * - DENIED → no token, no auto-reprompt
 */
function iosStatusIsRegisterable(status: number | undefined): boolean {
  const ios = Notifications.IosAuthorizationStatus;
  return (
    status === ios.AUTHORIZED ||
    status === ios.PROVISIONAL ||
    status === ios.EPHEMERAL
  );
}

export function classifyPushPermission(response: {
  status?: string | null;
  granted?: boolean;
  canAskAgain?: boolean;
  ios?: { status?: number | null };
} | null | undefined): PushPermissionKind {
  if (!response) return 'undetermined';
  if (response.granted === true || response.status === 'granted' || iosStatusIsRegisterable(response.ios?.status ?? undefined)) {
    return 'registerable';
  }
  if (response.ios?.status === Notifications.IosAuthorizationStatus.DENIED) {
    return 'denied';
  }
  if (
    response.status === 'undetermined' ||
    response.ios?.status === Notifications.IosAuthorizationStatus.NOT_DETERMINED ||
    response.status == null
  ) {
    return 'undetermined';
  }
  // Android 13+ / Expo often report `denied` before the first POST_NOTIFICATIONS prompt.
  // canAskAgain=true means the system dialog can still be shown — treat as undetermined.
  if (response.status === 'denied' && response.canAskAgain === true) {
    return 'undetermined';
  }
  if (response.status === 'denied') {
    return 'denied';
  }
  return 'denied';
}

export async function getPushPermissionKind(): Promise<PushPermissionKind> {
  try {
    const current = await Notifications.getPermissionsAsync();
    return classifyPushPermission(current);
  } catch {
    return 'undetermined';
  }
}

export async function requestPushPermission(): Promise<PushPermissionKind> {
  try {
    const result = await Notifications.requestPermissionsAsync();
    return classifyPushPermission(result);
  } catch {
    return 'denied';
  }
}
