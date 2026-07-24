/**
 * Резолв API key без логирования значения.
 * Приоритет: EXPO_PUBLIC_APPMETRICA_API_KEY → APPMETRICA_API_KEY (@env) → extra.
 */
export function resolveAppMetricaApiKey(): string {
  try {
    const fromProcess =
      (typeof process !== 'undefined' &&
        process.env &&
        (process.env.EXPO_PUBLIC_APPMETRICA_API_KEY || process.env.APPMETRICA_API_KEY)) ||
      '';
    if (typeof fromProcess === 'string' && fromProcess.trim()) {
      return fromProcess.trim();
    }
  } catch {
    /* ignore */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const envMod = require('@env') as {
      EXPO_PUBLIC_APPMETRICA_API_KEY?: string;
      APPMETRICA_API_KEY?: string;
    };
    const fromDotenv =
      envMod.EXPO_PUBLIC_APPMETRICA_API_KEY || envMod.APPMETRICA_API_KEY || '';
    if (typeof fromDotenv === 'string' && fromDotenv.trim()) {
      return fromDotenv.trim();
    }
  } catch {
    /* @env may be absent in some test runners */
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: Record<string, unknown> };
    };
    const extra = Constants.expoConfig?.extra ?? {};
    const fromExtra =
      (typeof extra.EXPO_PUBLIC_APPMETRICA_API_KEY === 'string' &&
        extra.EXPO_PUBLIC_APPMETRICA_API_KEY) ||
      (typeof extra.APPMETRICA_API_KEY === 'string' && extra.APPMETRICA_API_KEY) ||
      '';
    if (fromExtra.trim()) return fromExtra.trim();
  } catch {
    /* ignore */
  }

  return '';
}

function parseEnabledFlag(raw: unknown): boolean {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Opt-in smoke event; default false. */
export function isAppMetricaTestEventEnabled(): boolean {
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (parseEnabledFlag(process.env.EXPO_PUBLIC_APPMETRICA_TEST_EVENT_ENABLED)) return true;
    }
  } catch {
    /* ignore */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const envMod = require('@env') as { EXPO_PUBLIC_APPMETRICA_TEST_EVENT_ENABLED?: string };
    if (parseEnabledFlag(envMod.EXPO_PUBLIC_APPMETRICA_TEST_EVENT_ENABLED)) return true;
  } catch {
    /* ignore */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default as {
      expoConfig?: { extra?: Record<string, unknown> };
    };
    const extra = Constants.expoConfig?.extra ?? {};
    if (parseEnabledFlag(extra.EXPO_PUBLIC_APPMETRICA_TEST_EVENT_ENABLED)) return true;
  } catch {
    /* ignore */
  }
  return false;
}
