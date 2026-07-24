import type { AnalyticsEvent } from '../events';
import type {
  AnalyticsProperties,
  AnalyticsProvider,
  AnalyticsRevenue,
  AnalyticsUser,
} from '../types';
import { logger } from '@src/utils/logger';

type AppMetricaModule = typeof import('@appmetrica/react-native-analytics').default;

function safeCall(label: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    logger.error(`[analytics:appmetrica] ${label}`, error);
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
        // app_open не шлём вручную — используем автосессии SDK.
        appOpenTrackingEnabled: true,
        logs: typeof __DEV__ !== 'undefined' ? __DEV__ : false,
      });
      this.activated = true;
    } catch (error) {
      logger.error('[analytics:appmetrica] activate failed', error);
      this.sdk = null;
      this.activated = false;
    }
  }

  track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
    if (!this.sdk || !this.activated) return;
    const name = String(event);
    safeCall('reportEvent', () => {
      this.sdk!.reportEvent(name, properties as Record<string, unknown> | undefined);
    });
  }

  setUser(user: AnalyticsUser): void {
    if (!this.sdk || !this.activated) return;
    const id = String(user.id);
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
    safeCall('reportRevenue', () => {
      this.sdk!.reportRevenue({
        price: revenue.price,
        currency: revenue.currency,
        productID: revenue.productID,
        quantity: revenue.quantity ?? 1,
        payload: revenue.payload
          ? JSON.stringify(revenue.payload)
          : undefined,
      });
    });
  }

  reportError(identifier: string, message?: string): void {
    if (!this.sdk || !this.activated) return;
    safeCall('reportError', () => {
      this.sdk!.reportError(identifier, message ?? identifier);
    });
  }
}
