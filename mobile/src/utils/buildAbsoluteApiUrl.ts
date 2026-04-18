import { env } from '@src/config/env';
import { normalizeRelativeUrlForApiBase } from './normalizeApiUrl';

/**
 * Итоговый URL такой же, как у axios apiClient после normalizeRelativeUrlForApiBase.
 *
 * Важно: модалки использовали `fetch(\`${API_URL}/api/master/profile\`)`. Если `API_URL`
 * уже заканчивается на `/api` (типичный baseURL), получалось `/api/api/master/profile` → 404/405,
 * multipart не доходил до обработчика, фото в БД не обновлялось, а GET settings оставался старым.
 */
export function buildAbsoluteApiUrl(pathFromServerRoot: string): string {
  const base = (env.API_URL || '').replace(/\/+$/, '');
  const path = pathFromServerRoot.startsWith('/') ? pathFromServerRoot : `/${pathFromServerRoot}`;
  const normalizedPath = normalizeRelativeUrlForApiBase(base, path) ?? path;
  const suffix = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  return `${base}${suffix}`;
}
