/**
 * Разрешённый returnTo с экрана ЛК: только публичная запись /m/{slug}, без query и без path traversal.
 */
export function sanitizePublicBookingReturnTo(raw: string | string[] | undefined): string | null {
  const s0 = Array.isArray(raw) ? raw[0] : raw;
  if (!s0 || typeof s0 !== 'string') return null;
  let s: string;
  try {
    s = decodeURIComponent(s0.trim());
  } catch {
    s = s0.trim();
  }
  if (!s.startsWith('/m/')) return null;
  if (s.includes('..') || s.includes('\n') || s.includes('?') || s.includes('#')) return null;
  const rest = s.slice(3);
  if (!rest || rest.includes('/')) return null;
  if (rest.length > 120) return null;
  if (!/^[\w.-]+$/i.test(rest)) return null;
  return `/m/${rest}`;
}
