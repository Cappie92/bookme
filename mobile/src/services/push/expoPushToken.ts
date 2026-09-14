import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

const TOKEN_RE = /^[A-Za-z0-9_.:\[\]-]{16,512}$/;
const REPLACED_SENTINEL_RE = /^replaced:\d+$/;

export type ExpoPushTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'missing_project_id' | 'unavailable' | 'invalid_token' };

type ConstantsWithEas = {
  easConfig?: { projectId?: string };
  expoConfig?: { extra?: { eas?: { projectId?: string } } };
};

export function resolveEasProjectId(): string | null {
  const constants = Constants as ConstantsWithEas;
  const id =
    constants.easConfig?.projectId ||
    constants.expoConfig?.extra?.eas?.projectId ||
    null;
  if (typeof id === 'string' && id.trim()) return id.trim();
  return null;
}

export function isPlausibleExpoPushToken(token: string): boolean {
  const trimmed = token.trim();
  return TOKEN_RE.test(trimmed) && !REPLACED_SENTINEL_RE.test(trimmed);
}

export function expoPushTokenSuffixForDiag(token: string): string {
  const trimmed = token.trim();
  return trimmed.slice(-6);
}

export async function acquireExpoPushToken(): Promise<ExpoPushTokenResult> {
  const projectId = resolveEasProjectId();
  if (!projectId) {
    return { ok: false, reason: 'missing_project_id' };
  }
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = typeof result?.data === 'string' ? result.data.trim() : '';
    if (!isPlausibleExpoPushToken(token)) {
      return { ok: false, reason: 'invalid_token' };
    }
    return { ok: true, token };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
