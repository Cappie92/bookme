/**
 * Убирает префикс "Инди: " или "Indie: " из названия услуги.
 * Соответствует backend strip_indie_service_prefix и web stripIndiePrefix.
 */
export function stripIndiePrefix(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return name ?? '';
  return name.replace(/^(Инди|Indie):\s*/i, '').trim();
}
