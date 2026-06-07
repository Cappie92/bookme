/** Нормализация slug страницы записи мастера (/m/{slug}). */
export function normalizeMasterDomainSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

export function validateMasterDomainSlug(slug: string): string | null {
  const normalized = normalizeMasterDomainSlug(slug);
  if (!normalized) return 'Укажите адрес страницы';
  if (normalized.length < 2) return 'Минимум 2 символа';
  if (normalized.length > 64) return 'Максимум 64 символа';
  if (!/^[a-z0-9-]+$/.test(normalized)) {
    return 'Только латиница, цифры и дефис';
  }
  if (normalized.startsWith('-') || normalized.endsWith('-')) {
    return 'Адрес не может начинаться или заканчиваться дефисом';
  }
  return null;
}
