/**
 * Локальные настройки уведомлений клиента (напоминания, изменения, маркетинг).
 * Backend-эндпоинта пока нет — хранение в localStorage; при появлении API
 * заменить реализацию get/save, сохранив те же ключи объекта.
 */
const STORAGE_KEY = 'dedato_client_notification_prefs_v1'

export const DEFAULT_CLIENT_NOTIFICATION_PREFS = {
  booking_reminder: true,
  booking_changes: true,
  marketing: false,
}

function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    booking_reminder: Boolean(src.booking_reminder ?? DEFAULT_CLIENT_NOTIFICATION_PREFS.booking_reminder),
    booking_changes: Boolean(src.booking_changes ?? DEFAULT_CLIENT_NOTIFICATION_PREFS.booking_changes),
    marketing: Boolean(src.marketing ?? DEFAULT_CLIENT_NOTIFICATION_PREFS.marketing),
  }
}

export async function getClientNotificationPreferences() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CLIENT_NOTIFICATION_PREFS }
    return normalize(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_CLIENT_NOTIFICATION_PREFS }
  }
}

export async function saveClientNotificationPreferences(next) {
  const normalized = normalize(next)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}
