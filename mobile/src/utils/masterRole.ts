/** Нормализованная роль пользователя для routing/feature gates. */
export function normalizeAppRole(role: unknown): string {
  if (typeof role === 'string') return role.trim().toLowerCase();
  if (role == null) return '';
  return String(role).trim().toLowerCase();
}

/** Мастерский аккаунт (включая indie), не client/salon/admin. */
export function isMasterAppRole(role: unknown): boolean {
  const normalized = normalizeAppRole(role);
  return normalized === 'master' || normalized === 'indie';
}
