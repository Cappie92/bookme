/**
 * Dev-only буфер ошибок для копирования из приложения (Android / iOS).
 * Включается только при env.SHOW_DBG_FLOATING_PANEL (строго DEBUG_MOBILE_ERRORS=1 в .env).
 */
import { env } from '@src/config/env';

const MAX_ENTRIES = 80;
const SEP = '\n---\n';

export type ApiErrorSnapshot = {
  method: string;
  path: string;
  fullUrl: string;
  status?: number;
  code?: string;
  message: string;
  bodyPreview?: string;
  platform: string;
  effectiveApiUrl: string;
};

type EntryKind = 'api' | 'runtime' | 'logger';

type CaptureEntry = {
  id: string;
  ts: number;
  kind: EntryKind;
  title: string;
  body: string;
};

let seq = 0;
const entries: CaptureEntry[] = [];
const listeners = new Set<() => void>();

export function isMobileErrorDebugEnabled(): boolean {
  return env.SHOW_DBG_FLOATING_PANEL;
}

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function push(kind: EntryKind, title: string, body: string): void {
  if (!isMobileErrorDebugEnabled()) return;
  const id = `${Date.now()}-${++seq}`;
  entries.push({ id, ts: Date.now(), kind, title, body: body.trim() });
  while (entries.length > MAX_ENTRIES) entries.shift();
  notify();
}

export function subscribeMobileErrorCapture(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMobileErrorCaptureEntries(): readonly CaptureEntry[] {
  return entries;
}

export function getMobileErrorCaptureFullText(): string {
  if (entries.length === 0) return '(пусто)';
  return entries
    .map((e) => {
      const iso = new Date(e.ts).toISOString();
      return `[${iso}] ${e.title}\n${e.body}`;
    })
    .join(SEP);
}

export function clearMobileErrorCapture(): void {
  entries.length = 0;
  notify();
}

export function recordApiErrorSnapshot(s: ApiErrorSnapshot): void {
  if (!isMobileErrorDebugEnabled()) return;
  const lines = [
    `timestamp: ${new Date().toISOString()}`,
    `platform: ${s.platform}`,
    `effectiveAPI_URL: ${s.effectiveApiUrl}`,
    `method: ${s.method}`,
    `path: ${s.path}`,
    `fullURL: ${s.fullUrl}`,
    s.status != null ? `status: ${s.status}` : 'status: (no response)',
    s.code != null && s.code !== '' ? `code: ${s.code}` : null,
    `message: ${s.message}`,
    s.bodyPreview != null && s.bodyPreview !== '' ? `bodyPreview:\n${s.bodyPreview}` : null,
  ].filter(Boolean) as string[];
  const title = `[API] ${s.method} ${s.path}${s.status != null ? ` → ${s.status}` : ''}${s.code ? ` (${s.code})` : ''}`;
  push('api', title, lines.join('\n'));
}

function serializeUnknown(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message || String(err), stack: err.stack };
  }
  if (typeof err === 'object' && err !== null) {
    try {
      return { message: JSON.stringify(err) };
    } catch {
      return { message: String(err) };
    }
  }
  return { message: String(err) };
}

export function recordRuntimeError(err: unknown, isFatal?: boolean, source?: string): void {
  if (!isMobileErrorDebugEnabled()) return;
  const { message, stack } = serializeUnknown(err);
  const lines = [
    `timestamp: ${new Date().toISOString()}`,
    `source: ${source || 'global'}`,
    `isFatal: ${isFatal === true ? 'yes' : 'no'}`,
    `message: ${message}`,
    stack ? `stack:\n${stack}` : null,
  ].filter(Boolean) as string[];
  push('runtime', `[RUNTIME] ${message.slice(0, 120)}`, lines.join('\n'));
}

export function recordUnhandledRejection(reason: unknown): void {
  if (!isMobileErrorDebugEnabled()) return;
  const { message, stack } = serializeUnknown(reason);
  const lines = [
    `timestamp: ${new Date().toISOString()}`,
    `source: unhandledrejection`,
    `message: ${message}`,
    stack ? `stack:\n${stack}` : null,
  ].filter(Boolean) as string[];
  push('runtime', `[UNHANDLED] ${message.slice(0, 120)}`, lines.join('\n'));
}

export function recordLoggerErrorArgs(args: unknown[]): void {
  if (!isMobileErrorDebugEnabled()) return;
  const body = args
    .map((a) => {
      if (a instanceof Error) return `${a.message}\n${a.stack || ''}`;
      if (typeof a === 'object' && a !== null) {
        try {
          return JSON.stringify(a, null, 2);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join('\n');
  // Ожидаемый шум при cold start: 401 на /auth/users/me — не дублируем в DBG-буфер.
  if (/auth\/users\/me/i.test(body) && /\b401\b/.test(body)) return;
  const preview = body.slice(0, 200).replace(/\n/g, ' ');
  push('logger', `[LOGGER.error] ${preview}`, `timestamp: ${new Date().toISOString()}\n${body}`);
}
