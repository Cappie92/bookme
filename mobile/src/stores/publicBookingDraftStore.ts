/**
 * Draft публичной записи — сохраняется перед переходом на логин.
 * После успешного логина пользователь возвращается на /m/slug и завершает бронь.
 * Идемпотентность: status + attempt_id + created_booking_id, draft очищается только после успешного POST (200/201).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_KEY = 'public_booking_draft';

export type DraftStatus = 'pending' | 'submitted' | 'done';

/** Устанавливается только при CTA «Записаться» без логина (confirm flow). Логин из шапки не ставит intent. */
export type DraftIntent = 'create_after_auth';

export interface PublicBookingDraft {
  slug: string;
  service_id: number;
  start_time: string;
  end_time: string;
  /** Уникальный id попытки; задаётся при сохранении перед логином. */
  attempt_id?: string;
  /** После успешного POST — id созданной брони. */
  created_booking_id?: number;
  /** Публичный код записи для UI и календаря. */
  created_public_reference?: string;
  /** pending: можно создавать; submitted: запрос ушёл, не дублировать; done: создано, можно очистить. */
  status?: DraftStatus;
  /** Только при confirm flow: после логина автосоздать бронь. Без intent (логин из шапки) не создаём. */
  intent?: DraftIntent;
}

export async function savePublicBookingDraft(draft: PublicBookingDraft): Promise<void> {
  const payload: PublicBookingDraft = {
    ...draft,
    status: draft.status ?? 'pending',
  };
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
}

export async function getPublicBookingDraft(): Promise<PublicBookingDraft | null> {
  const raw = await AsyncStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as PublicBookingDraft;
    if (d?.slug && d?.service_id != null && d?.start_time && d?.end_time) return d;
  } catch {
    /* ignore */
  }
  return null;
}

/** Редирект на /m/<slug> после логина только если draft из confirm flow и ещё не создан/не отправлен. */
export function isDraftValidForPostLoginRedirect(draft: PublicBookingDraft | null): draft is PublicBookingDraft {
  if (!draft?.slug || draft.intent !== 'create_after_auth') return false;
  if (draft.status === 'submitted' || draft.status === 'done') return false;
  if (draft.created_booking_id != null || draft.created_public_reference != null) return false;
  return true;
}

export async function updatePublicBookingDraftStatus(
  updates: Pick<
    PublicBookingDraft,
    'status' | 'created_booking_id' | 'created_public_reference' | 'intent'
  >
): Promise<void> {
  const draft = await getPublicBookingDraft();
  if (!draft) return;
  await AsyncStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ ...draft, ...updates })
  );
}

export async function clearPublicBookingDraft(): Promise<void> {
  await AsyncStorage.removeItem(DRAFT_KEY);
}
