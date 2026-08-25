import type { AnalyticsEvent } from '../events';
import type {
  AnalyticsProperties,
  AnalyticsProvider,
  AnalyticsRevenue,
  AnalyticsUser,
} from '../types';
import { logger } from '@src/utils/logger';
import {
  normalizeAnalyticsUserId,
  sanitizeAnalyticsErrorIdentifier,
  sanitizeAnalyticsErrorText,
  sanitizeAnalyticsProductId,
  sanitizeAnalyticsProperties,
} from '../normalize';

type AppMetricaModule = typeof import('@appmetrica/react-native-analytics').default;

function safeCall(label: string, fn: () => void): void {
  try {
    fn();
  } catch {
    logger.error(`[analytics:appmetrica] ${label} failed`);
  }
}

/**
 * Единственное место импорта AppMetrica SDK.
 * Экраны не должны импортировать @appmetrica/* напрямую.
 */
export class AppMetricaProvider implements AnalyticsProvider {
  readonly name = 'appmetrica';
  private apiKey: string;
  private sdk: AppMetricaModule | null = null;
  private activated = false;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async init(): Promise<void> {
    if (!this.apiKey || this.activated) return;
    try {
      const mod = await import('@appmetrica/react-native-analytics');
      this.sdk = mod.default;
      this.sdk.activate({
        apiKey: this.apiKey,
        // Advertising identifiers выключены (аналог trackAdvIdentifiersEnabled=false).
        advIdentifiersTracking: false,
        locationTracking: false,
        crashReporting: true,
        nativeCrashReporting: true,
        sessionsAutoTracking: true,
        // Manual revenue events are controlled by DeDato; avoid duplicate purchase collection.
        revenueAutoTrackingEnabled: false,
        // app_open не шлём вручную — используем автосессии SDK.
        appOpenTrackingEnabled: true,
        logs: typeof __DEV__ !== 'undefined' ? __DEV__ : false,
      });
      this.activated = true;
    } catch {
      logger.error('[analytics:appmetrica] activate failed');
      this.sdk = null;
      this.activated = false;
    }
  }

  track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
    if (!this.sdk || !this.activated) return;
    const name = String(event);
    const safeProperties = sanitizeAnalyticsProperties(properties);
    safeCall('reportEvent', () => {
      this.sdk!.reportEvent(name, safeProperties);
    });
  }

  setUser(user: AnalyticsUser): void {
    if (!this.sdk || !this.activated) return;
    const id = normalizeAnalyticsUserId(user.id);
    if (!id) return;
    safeCall('setUserProfileID', () => {
      this.sdk!.setUserProfileID(id);
    });
  }

  clearUser(): void {
    if (!this.sdk || !this.activated) return;
    safeCall('clearUserProfileID', () => {
      // AppMetrica: null/undefined сбрасывает profile id.
      this.sdk!.setUserProfileID(undefined);
    });
  }

  reportRevenue(revenue: AnalyticsRevenue): void {
    if (!this.sdk || !this.activated) return;
    const payload = sanitizeAnalyticsProperties(revenue.payload);
    const productID = sanitizeAnalyticsProductId(revenue.productID);
    safeCall('reportRevenue', () => {
      this.sdk!.reportRevenue({
        price: revenue.price,
        currency: revenue.currency,
        productID,
        quantity: revenue.quantity ?? 1,
        payload: Object.keys(payload).length ? JSON.stringify(payload) : undefined,
      });
    });
  }

  reportError(identifier: string, message?: string): void {
    if (!this.sdk || !this.activated) return;
    const safeIdentifier = sanitizeAnalyticsErrorIdentifier(identifier);
    const safeMessage = sanitizeAnalyticsErrorText(message ?? identifier);
    safeCall('reportError', () => {
      this.sdk!.reportError(safeIdentifier, safeMessage);
    });
  }
}
