import type { AnalyticsEvent } from '../events';
import type {
  AnalyticsProperties,
  AnalyticsProvider,
  AnalyticsRevenue,
  AnalyticsUser,
} from '../types';

/** Безопасный no-op provider (нет ключа / тесты / сбой SDK). */
export class NoOpAnalyticsProvider implements AnalyticsProvider {
  readonly name = 'noop';

  init(): void {}

  track(_event: AnalyticsEvent, _properties?: AnalyticsProperties): void {}

  setUser(_user: AnalyticsUser): void {}

  clearUser(): void {}

  reportRevenue(_revenue: AnalyticsRevenue): void {}

  reportError(_identifier: string, _message?: string): void {}
}
