/**
 * Диагностика доступности API. Только __DEV__ и DEBUG_HTTP.
 * Префикс логов: [NET_DIAG]
 */
import { env } from '@src/config/env';
import { logger } from '@src/utils/logger';

const HEALTH_TIMEOUT_MS = 3000;

export type HealthResult = {
  ok: boolean;
  ms: number;
  status?: number;
  bodyPreview?: string;
  error?: string;
  timeout?: boolean;
};

export type ConnectivityResult = {
  apiUrl: string;
  baseURL: string;
  health: HealthResult;
};

function shouldRun(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ && env.DEBUG_HTTP;
}

export async function debugConnectivity(): Promise<ConnectivityResult | null> {
  if (!shouldRun()) return null;
  const baseURL = (env.API_URL || '').trim().replace(/\/$/, '');
  const apiUrl = env.API_URL || '';
  const healthUrl = `${baseURL}/health`;
  const start = Date.now();
  const result: ConnectivityResult = {
    apiUrl,
    baseURL,
    health: { ok: false, ms: 0 },
  };

  logger.debug('auth', '[NET_DIAG] baseURL', baseURL);

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(to);
    result.health.ms = Date.now() - start;
    result.health.status = res.status;
    result.health.ok = res.ok;
    const text = await res.text();
    result.health.bodyPreview = text.slice(0, 120);
    if (env.DEBUG_LOGS || env.DEBUG_HTTP) {
      logger.debug('auth', '[NET_DIAG] health success', {
        status: res.status,
        ms: result.health.ms,
        body: result.health.bodyPreview,
      });
    }
  } catch (e: unknown) {
    clearTimeout(to);
    result.health.ms = Date.now() - start;
    const err = e as { name?: string; message?: string };
    result.health.error = err?.message || String(e);
    result.health.timeout = err?.name === 'AbortError';
    if (env.DEBUG_LOGS || env.DEBUG_HTTP) {
      logger.debug('auth', '[NET_DIAG] health fail', {
        ms: result.health.ms,
        timeout: result.health.timeout,
        error: result.health.error,
      });
    }
    if (
      baseURL.includes('localhost') ||
      baseURL.includes('127.0.0.1')
    ) {
      logger.debug(
        'auth',
        '[NET_DIAG] Подсказка: включи adb reverse tcp:8000 tcp:8000 или поставь API_URL=http://10.0.2.2:8000'
      );
    }
  }
  return result;
}
