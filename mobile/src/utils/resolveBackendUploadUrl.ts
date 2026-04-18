import { env } from '@src/config/env';

/**
 * Бэкенд отдаёт пути вида `uploads/photos/...` (и в GET /api/master/settings, и в public `avatar_url`).
 * В браузере это работает как относительный URL к origin; в React Native `Image` нужен абсолютный http(s).
 *
 * Статика `/uploads` на том же origin, что и API, но без префикса `/api` в path (см. FastAPI mount).
 * Если `API_URL` = `https://host/api`, файлы — `https://host/uploads/...`.
 */

export function resolveBackendUploadUrl(path: string | null | undefined): string | null {
  if (path == null) return null;
  const p = String(path).trim();
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;

  const normalizedPath = p.replace(/^\/+/, '');
  let base = (env.API_URL || '').replace(/\/+$/, '');
  if (/\/api$/i.test(base)) {
    base = base.slice(0, -4);
  }
  if (!base) return null;

  return `${base}/${normalizedPath}`;
}
