/**
 * Глобальные JS error / unhandled rejection → mobileErrorCapture (только dev + флаг).
 */
import { ErrorUtils } from 'react-native';
import { env } from '@src/config/env';
import { recordRuntimeError, recordUnhandledRejection } from './mobileErrorCapture';

export function installMobileErrorDebugHandlers(): void {
  if (!env.SHOW_DBG_FLOATING_PANEL) return;
  const G = globalThis as Record<string, unknown>;
  if (G.__dedatoMobileDebugInstalled) return;
  G.__dedatoMobileDebugInstalled = true;

  const prev = ErrorUtils.getGlobalHandler?.();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    try {
      recordRuntimeError(error, isFatal, 'ErrorUtils.globalHandler');
    } catch {
      /* ignore */
    }
    if (typeof prev === 'function') {
      prev(error, isFatal);
    }
  });

  try {
    const marker = '__dedatoUnhandledRejectionDebug';
    if (G[marker]) return;
    G[marker] = true;

    type RejectionEvent = { reason?: unknown; promise?: unknown };
    const gRej = globalThis as unknown as {
      onunhandledrejection?: (ev: RejectionEvent) => void;
    };
    const prevRejection = gRej.onunhandledrejection;

    gRej.onunhandledrejection = function (event: RejectionEvent) {
      try {
        recordUnhandledRejection(event?.reason);
      } catch {
        /* ignore */
      }
      if (typeof prevRejection === 'function') {
        return prevRejection.call(globalThis, event);
      }
    };
  } catch {
    /* среда без onunhandledrejection */
  }
}
