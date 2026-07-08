import AsyncStorage from '@react-native-async-storage/async-storage';

const storageKey = (masterId: number) => `master_schedule_notifications_viewed_v1:${masterId}`;

export async function loadViewedNotificationIds(masterId: number): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(masterId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x) => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

export async function markNotificationsViewed(
  masterId: number,
  ids: string[]
): Promise<Set<string>> {
  const existing = await loadViewedNotificationIds(masterId);
  for (const id of ids) existing.add(id);
  const next = Array.from(existing);
  await AsyncStorage.setItem(storageKey(masterId), JSON.stringify(next));
  return existing;
}
