import type {
  WebHandoffDestination,
  WebHandoffOrigin,
  WebHandoffResponse,
} from '@src/services/api/auth';

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
  try {
    const origin: WebHandoffOrigin = deps.platformOS === 'ios' ? 'ios_app' : 'android_app';
    const data = await deps.createWebHandoff(origin, destination);
    if (!data?.url) throw new Error('Не удалось получить ссылку');
    const lower = data.url.toLowerCase();
    if (lower.includes('access_token') || lower.includes('refresh_token')) {
      throw new Error('Некорректная ссылка handoff');
    }
    await deps.openURL(data.url);
    return 'opened';
  } catch (error: any) {
    const message =
      (typeof error?.response?.data?.detail === 'string' && error.response.data.detail) ||
      error?.message ||
      'Не удалось открыть веб-редактор';
    deps.showError('Ошибка', message);
    return 'error';
  }
}
