import type { WebHandoffOrigin, WebHandoffResponse } from '@src/services/api/auth';
import { isIosFreeCompanion } from '@src/config/iosProductModel';

export type OpenWebHandoffMoreDetailsDeps = {
  platformOS: string;
  createWebHandoff: (origin: WebHandoffOrigin) => Promise<WebHandoffResponse>;
  openURL: (url: string) => Promise<unknown>;
  showError: (title: string, message: string) => void;
};

/**
 * iOS/Android «Подробнее» → opaque web handoff URL (never JWT in query).
 * Errors surface via showError only — does not logout / clear session.
 */
export async function openWebHandoffMoreDetails(
  deps: OpenWebHandoffMoreDetailsDeps
): Promise<'opened' | 'error'> {
  try {
    if (isIosFreeCompanion(deps.platformOS)) {
      throw new Error('Переход к тарифам недоступен в приложении для iOS');
    }
    const origin: WebHandoffOrigin = deps.platformOS === 'ios' ? 'ios_app' : 'android_app';
    const data = await deps.createWebHandoff(origin);
    if (!data?.url) {
      throw new Error('Не удалось получить ссылку');
    }
    const lower = data.url.toLowerCase();
    if (lower.includes('access_token') || lower.includes('refresh_token')) {
      throw new Error('Некорректная ссылка handoff');
    }
    await deps.openURL(data.url);
    return 'opened';
  } catch (e: any) {
    const message =
      (typeof e?.response?.data?.detail === 'string' && e.response.data.detail) ||
      e?.message ||
      'Не удалось открыть страницу тарифов';
    deps.showError('Ошибка', message);
    return 'error';
  }
}
