/**
 * Централизованный логгер с уровнями и каналами DEBUG_*.
 * - error: всегда (dev+prod)
 * - warn/info: с channel — только при env.DEBUG_CHANNEL; без channel — только при env.DEBUG_LOGS
 * - debug: только при включённом channel
 * - http: sugar для DEBUG_HTTP
 */
import { env } from '@src/config/env';
import { recordLoggerErrorArgs } from '@src/debug/mobileErrorCapture';

type LogChannel = 'http' | 'auth' | 'features' | 'menu' | 'dashboard';

function isChannelEnabled(channel: LogChannel): boolean {
  // Каналы не зависят от DEBUG_LOGS — иначе один флаг в .env засыпает Metro всем подряд.
  // DEBUG_LOGS остаётся для warn/info без явного channel (см. ниже).
  switch (channel) {
    case 'menu':
      return env.DEBUG_MENU;
    case 'http':
      return env.DEBUG_HTTP;
    case 'auth':
      return env.DEBUG_AUTH;
    case 'features':
      return env.DEBUG_FEATURES;
    case 'dashboard':
      return env.DEBUG_DASHBOARD;
    default:
      return false;
  }
}

export const logger = {
  error: (...args: unknown[]) => {
    console.error(...args);
    if (env.SHOW_DBG_FLOATING_PANEL) {
      try {
        recordLoggerErrorArgs(args);
      } catch {
        /* ignore */
      }
    }
  },

  warn: ((channelOrArg: LogChannel | unknown, ...rest: unknown[]) => {
    if (!__DEV__) return;
    if (typeof channelOrArg === 'string' && ['http', 'auth', 'features', 'menu', 'dashboard'].includes(channelOrArg)) {
      if (isChannelEnabled(channelOrArg as LogChannel)) console.warn(...rest);
    } else {
      if (env.DEBUG_LOGS) console.warn(channelOrArg, ...rest);
    }
  }) as {
    (channel: LogChannel, ...args: unknown[]): void;
    (...args: unknown[]): void;
  },

  info: ((channelOrArg: LogChannel | unknown, ...rest: unknown[]) => {
    if (!__DEV__) return;
    if (typeof channelOrArg === 'string' && ['http', 'auth', 'features', 'menu', 'dashboard'].includes(channelOrArg)) {
      if (isChannelEnabled(channelOrArg as LogChannel)) console.log(...rest);
    } else {
      if (env.DEBUG_LOGS) console.log(channelOrArg, ...rest);
    }
  }) as {
    (channel: LogChannel, ...args: unknown[]): void;
    (...args: unknown[]): void;
  },

  debug: (channel: LogChannel, ...args: unknown[]) => {
    if (!__DEV__) return;
    if (isChannelEnabled(channel)) console.log(...args);
  },

  /** HTTP-запросы/ответы — только при DEBUG_HTTP */
  http: (...args: unknown[]) => {
    if (__DEV__ && env.DEBUG_HTTP) console.log(...args);
  },
};
