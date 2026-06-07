/** Нормализация телефона для API ограничений/скидок (как в client-restrictions). */
export function normalizeClientPhoneForApi(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('7') ? `+${digits}` : `+7${digits}`;
}

export function masterClientDisplayName(
  name: string | null | undefined,
  phone: string
): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : phone;
}
