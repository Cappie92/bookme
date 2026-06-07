import { isAxiosError } from 'axios';

export const AUTH_REQUEST_TIMEOUT_MS = 20_000;

export const CONNECTIVITY_ERROR_MESSAGE =
  'Не удалось подключиться к серверу. Проверьте интернет или VPN и попробуйте снова.';

/** Сетевые/таймаут ошибки без HTTP-ответа (VPN, offline, DNS, SSL). */
export function isConnectivityFailure(error: unknown): boolean {
  if (isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return true;
    if (error.code === 'ERR_NETWORK') return true;
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return true;
    }
    if (!error.response) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('network error') || msg.includes('timeout') || msg.includes('ssl')) {
        return true;
      }
    }
    return false;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('network error') || msg.includes('timeout');
  }
  return false;
}

export function mapLoginRequestError(error: unknown): string {
  if (isConnectivityFailure(error)) {
    return CONNECTIVITY_ERROR_MESSAGE;
  }
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) {
      return 'Неверный номер телефона или пароль';
    }
    const data = error.response?.data;
    if (data && typeof data === 'object' && 'detail' in data) {
      const d = (data as { detail?: unknown }).detail;
      if (typeof d === 'string') return d;
      if (Array.isArray(d)) {
        return d
          .map((x) =>
            x && typeof x === 'object' && 'msg' in x ? String((x as { msg?: unknown }).msg) : String(x)
          )
          .join(' ');
      }
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Ошибка входа';
}
