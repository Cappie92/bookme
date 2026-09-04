import type {
  WebHandoffDestination,
  WebHandoffOrigin,
  WebHandoffResponse,
} from '@src/services/api/auth';
import { logger } from '@src/utils/logger';

const WEB_HANDOFF_DESTINATIONS: readonly WebHandoffDestination[] = [
  'schedule',
  'services',
  'settings',
];
const WEB_HANDOFF_ERROR_MESSAGE = 'Не удалось открыть браузер. Попробуйте ещё раз.';
const SAFE_ERROR_TYPES = new Set(['Error', 'TypeError', 'AxiosError', 'CodedError']);
const SAFE_ERROR_CODES = new Set([
  'ERR_NETWORK',
  'ERR_CANCELED',
  'ECONNABORTED',
  'ETIMEDOUT',
]);

type WebHandoffStage =
  | 'destination_validation'
  | 'request'
  | 'response_validation'
  | 'browser_open';

function isWebHandoffDestination(value: unknown): value is WebHandoffDestination {
  return WEB_HANDOFF_DESTINATIONS.includes(value as WebHandoffDestination);
}

function sanitizedErrorDiagnostic(error: unknown): { errorType: string; errorCode: string } {
  if (!error || typeof error !== 'object') {
    return { errorType: typeof error, errorCode: 'none' };
  }
  const record = error as { name?: unknown; code?: unknown };
  return {
    errorType:
      typeof record.name === 'string' && SAFE_ERROR_TYPES.has(record.name)
        ? record.name
        : 'unknown',
    errorCode:
      typeof record.code === 'string' && SAFE_ERROR_CODES.has(record.code)
        ? record.code
        : typeof record.code === 'number'
          ? 'native_numeric'
          : 'none',
  };
}

export type OpenWebHandoffDestinationDeps = {
  platformOS: string;
  createWebHandoff: (
    origin: WebHandoffOrigin,
    destination?: WebHandoffDestination
  ) => Promise<WebHandoffResponse>;
  openURL: (url: string) => Promise<unknown>;
  showError: (title: string, message: string) => void;
};

/** Open an authenticated operational web editor using a one-time opaque code. */
export async function openWebHandoffDestination(
  destination: WebHandoffDestination,
  deps: OpenWebHandoffDestinationDeps
): Promise<'opened' | 'error'> {
  let stage: WebHandoffStage = 'destination_validation';
  try {
    if (!isWebHandoffDestination(destination)) {
      throw new Error('INVALID_DESTINATION');
    }
    const origin: WebHandoffOrigin = deps.platformOS === 'ios' ? 'ios_app' : 'android_app';
    stage = 'request';
    const data = await deps.createWebHandoff(origin, destination);
    stage = 'response_validation';
    if (!data?.url) throw new Error('Не удалось получить ссылку');
    const lower = data.url.toLowerCase();
    if (lower.includes('access_token') || lower.includes('refresh_token')) {
      throw new Error('Некорректная ссылка handoff');
    }
    stage = 'browser_open';
    await deps.openURL(data.url);
    return 'opened';
  } catch (error: unknown) {
    logger.error('[web-handoff] operation failed', {
      destination: isWebHandoffDestination(destination) ? destination : 'invalid',
      stage,
      ...sanitizedErrorDiagnostic(error),
    });
    deps.showError('Ошибка', WEB_HANDOFF_ERROR_MESSAGE);
    return 'error';
  }
}
