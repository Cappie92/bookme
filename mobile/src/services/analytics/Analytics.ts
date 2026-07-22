import { AnalyticsEvent } from './events';
import {
  buildCommonAnalyticsContext,
  mergeEventProperties,
} from './normalize';
import { AppMetricaProvider } from './providers/AppMetricaProvider';
import { NoOpAnalyticsProvider } from './providers/NoOpProvider';
import type {
  AnalyticsProperties,
  AnalyticsProvider,
  AnalyticsRevenue,
  AnalyticsUser,
} from './types';
import { logger } from '@src/utils/logger';
import { resolveAppMetricaApiKey, isAppMetricaTestEventEnabled } from './apiKey';

export { isAppMetricaTestEventEnabled };
/**
 * Фасад аналитики. Экраны и доменные сервисы ходят только сюда.
 * Готов к нескольким provider'ам (Firebase / AppsFlyer / Amplitude / backend).
 */
class AnalyticsFacade {
  private providers: AnalyticsProvider[] = [];
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private role: string | null = null;
  private userId: string | null = null;

  async init(providers?: AnalyticsProvider[]): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (providers && providers.length > 0) {
          this.providers = providers;
        } else {
          this.providers = [this.createDefaultProvider()];
        }
        await Promise.all(
          this.providers.map(async (p) => {
            try {
              await p.init();
            } catch (error) {
              logger.error(`[analytics] provider init failed: ${p.name}`, error);
            }
          })
        );
      } finally {
        this.initialized = true;
      }
    })();

    return this.initPromise;
  }

  private createDefaultProvider(): AnalyticsProvider {
    const apiKey = resolveAppMetricaApiKey();
    if (!apiKey) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        logger.debug('auth', 'AppMetrica API key missing — using NoOp provider');
      }
      return new NoOpAnalyticsProvider();
    }
    return new AppMetricaProvider(apiKey);
  }

  /** Для unit-тестов: подмена providers без реального SDK. */
  resetForTests(providers: AnalyticsProvider[] = [new NoOpAnalyticsProvider()]): void {
    this.providers = providers;
    this.initialized = true;
    this.initPromise = null;
    this.role = null;
    this.userId = null;
  }

  track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
    try {
      const common = buildCommonAnalyticsContext(this.role);
      const payload = mergeEventProperties(common, properties);
      for (const provider of this.providers) {
        try {
          provider.track(event, payload);
        } catch (error) {
          logger.error(`[analytics] track failed: ${provider.name}`, error);
        }
      }
    } catch (error) {
      logger.error('[analytics] track facade error', error);
    }
  }

  setUser(user: AnalyticsUser): void {
    try {
      const nextId = String(user.id);
      if (this.userId && this.userId !== nextId) {
        this.clearUser();
      }
      this.userId = nextId;
      this.role = user.role != null ? String(user.role) : this.role;
      for (const provider of this.providers) {
        try {
          provider.setUser({ id: nextId, role: this.role });
        } catch (error) {
          logger.error(`[analytics] setUser failed: ${provider.name}`, error);
        }
      }
    } catch (error) {
      logger.error('[analytics] setUser facade error', error);
    }
  }

  clearUser(): void {
    try {
      this.userId = null;
      this.role = null;
      for (const provider of this.providers) {
        try {
          provider.clearUser();
        } catch (error) {
          logger.error(`[analytics] clearUser failed: ${provider.name}`, error);
        }
      }
    } catch (error) {
      logger.error('[analytics] clearUser facade error', error);
    }
  }

  /** Обновить role без смены user id (после refresh профиля). */
  setRole(role: string | null | undefined): void {
    this.role = role != null ? String(role) : null;
  }

  reportRevenue(revenue: AnalyticsRevenue): void {
    try {
      for (const provider of this.providers) {
        try {
          provider.reportRevenue?.(revenue);
        } catch (error) {
          logger.error(`[analytics] reportRevenue failed: ${provider.name}`, error);
        }
      }
    } catch (error) {
      logger.error('[analytics] reportRevenue facade error', error);
    }
  }

  reportError(identifier: string, message?: string): void {
    try {
      for (const provider of this.providers) {
        try {
          provider.reportError?.(identifier, message);
        } catch (error) {
          logger.error(`[analytics] reportError failed: ${provider.name}`, error);
        }
      }
    } catch (error) {
      logger.error('[analytics] reportError facade error', error);
    }
  }

  /** Smoke-событие для проверки интеграции (не PII). */
  trackIntegrationTest(): void {
    this.track(AnalyticsEvent.AppMetricaIntegrationTest, { screen: 'bootstrap' });
  }
}

export const analytics = new AnalyticsFacade();
