/**
 * Dev-only ring buffer: копируемый auth lifecycle trace (DEBUG_AUTH_TRACE).
 * Не пишет секреты: только длины/наличие токена, не сам JWT.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { env } from '@src/config/env';
import { AUTH_LOGOUT_MARKER, AUTH_TOKEN_KEY, AUTH_USER_KEY, readToken } from '@src/auth/tokenStorage';

const MAX_LINES = 450;
const lines: string[] = [];
const listeners = new Set<() => void>();

export function isAuthRuntimeTraceEnabled(): boolean {
  return __DEV__ && env.DEBUG_AUTH_TRACE;
}

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function iso(): string {
  return new Date().toISOString();
}

/** Одна строка в буфер (timestamp префикс). */
export function authTrace(message: string): void {
  if (!isAuthRuntimeTraceEnabled()) return;
  lines.push(`${iso()} | ${message}`);
  while (lines.length > MAX_LINES) lines.shift();
  notify();
}

export function subscribeAuthRuntimeTrace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthRuntimeTraceText(): string {
  if (lines.length === 0) return '(auth trace пуст — событий ещё не было)';
  return lines.join('\n');
}

export function clearAuthRuntimeTrace(): void {
  lines.length = 0;
  notify();
}

/** AsyncStorage snapshot (без SecureStore для «истины» Expo Go — совпадает с tokenStorage веткой expo). */
export async function authTraceStorageSnapshot(tag: string): Promise<void> {
  if (!isAuthRuntimeTraceEnabled()) return;
  try {
    const [at, ud, lm] = await Promise.all([
      AsyncStorage.getItem(AUTH_TOKEN_KEY),
      AsyncStorage.getItem(AUTH_USER_KEY),
      AsyncStorage.getItem(AUTH_LOGOUT_MARKER),
    ]);
    const expoGo = Constants.appOwnership === 'expo';
    authTrace(
      `[snapshot:${tag}] platform=${Platform.OS} effective_API_URL=${env.API_URL} Constants.appOwnership=${String(Constants.appOwnership)} storage_branch=${expoGo ? 'expo_go→AsyncStorage' : 'native→SecureStore+fallback'}`
    );
    authTrace(
      `[snapshot:${tag}] has_access_token=${Boolean(at)} access_token_len=${at?.length ?? 0} has_user_data=${Boolean(ud)} user_data_len=${ud?.length ?? 0} has_logout_marker=${Boolean(lm)} logout_marker_value=${lm ?? '(none)'}`
    );
  } catch (e) {
    authTrace(`[snapshot:${tag}] ERROR ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** readToken() как в приложении — для согласованности с bootstrap. */
export async function authTraceReadTokenHint(tag: string): Promise<void> {
  if (!isAuthRuntimeTraceEnabled()) return;
  try {
    const t = await readToken();
    authTrace(`[readToken:${tag}] has_token=${Boolean(t)} len=${t?.length ?? 0}`);
  } catch (e) {
    authTrace(`[readToken:${tag}] ERROR ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function authTraceDestructive(
  callSite: string,
  reason: string,
  tokenInContext: boolean | null,
  pathHint?: string
): void {
  if (!isAuthRuntimeTraceEnabled()) return;
  authTrace(
    `[DESTRUCTIVE] site=${callSite} reason=${reason} token_in_context=${String(tokenInContext)} path=${pathHint ?? '(n/a)'}`
  );
  void (async () => {
    await authTraceReadTokenHint(`after_${callSite}`);
  })();
}
