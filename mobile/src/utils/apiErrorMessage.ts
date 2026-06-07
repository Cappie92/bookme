/** Текст ошибки из FastAPI `detail` (строка, массив validation errors, объект). */
export function messageFromApiDetail(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const msg = (item as { msg?: string }).msg;
        const loc = (item as { loc?: unknown[] }).loc;
        const field = Array.isArray(loc) ? String(loc[loc.length - 1] ?? '') : '';
        if (msg && field) return `${field}: ${msg}`;
        return msg || null;
      })
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
  }
  return fallback;
}

/** Поля формы из validation errors FastAPI (последний сегмент loc). */
export function fieldErrorsFromApiDetail(detail: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(detail)) return out;
  for (const item of detail) {
    if (!item || typeof item !== 'object') continue;
    const loc = (item as { loc?: unknown[] }).loc;
    const msg = (item as { msg?: string }).msg;
    if (!msg || !Array.isArray(loc)) continue;
    const field = String(loc[loc.length - 1] ?? '');
    if (field) out[field] = msg;
  }
  return out;
}

/** Сообщение по birth_date из текста detail (в т.ч. русские ответы backend). */
export function birthDateErrorFromMessage(message: string): string | null {
  const lower = message.toLowerCase();
  if (
    lower.includes('birth_date') ||
    lower.includes('дата рождения') ||
    lower.includes('некорректная дата')
  ) {
    return message.includes('дата') ? message : 'Некорректная дата рождения';
  }
  return null;
}
