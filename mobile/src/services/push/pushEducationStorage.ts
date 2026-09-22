import AsyncStorage from '@react-native-async-storage/async-storage';
import { withTimeout } from '@src/utils/promiseWithTimeout';

export const PUSH_EDUCATION_STORAGE_KEY = 'dedato_push_education_v1';

export type PushEducationState = 'unseen' | 'shown' | 'accepted' | 'dismissed';

const STORAGE_TIMEOUT_MS = 2000;

function parseState(raw: string | null): PushEducationState {
  if (raw === 'shown' || raw === 'accepted' || raw === 'dismissed') return raw;
  return 'unseen';
}

export async function getPushEducationState(): Promise<PushEducationState> {
  try {
    const raw = await withTimeout(AsyncStorage.getItem(PUSH_EDUCATION_STORAGE_KEY), STORAGE_TIMEOUT_MS);
    return parseState(raw);
  } catch {
    return 'unseen';
  }
}

export async function setPushEducationState(state: Exclude<PushEducationState, 'unseen'>): Promise<void> {
  try {
    await withTimeout(AsyncStorage.setItem(PUSH_EDUCATION_STORAGE_KEY, state), STORAGE_TIMEOUT_MS);
  } catch {
    /* fail-open: missing persistence may re-show education once */
  }
}

export function isPushEducationPending(state: PushEducationState): boolean {
  // `shown` stays pending until the user taps Allow / Не сейчас so an auth-restore
  // race cannot permanently swallow the first-run prompt.
  return state === 'unseen' || state === 'shown';
}
