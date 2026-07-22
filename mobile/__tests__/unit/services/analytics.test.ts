/**
 * Unit tests: Analytics Layer (mock providers, no SDK, no API key crash).
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios },
}));

import { AnalyticsEvent } from '@src/services/analytics/events';
import { analytics } from '@src/services/analytics/Analytics';
import { NoOpAnalyticsProvider } from '@src/services/analytics/providers/NoOpProvider';
import {
  buildCommonAnalyticsContext,
  mergeEventProperties,
  sanitizeAnalyticsProperties,
} from '@src/services/analytics/normalize';
import { resolvePaymentVerifyState } from '@src/utils/paymentPublicStatus';
import type { AnalyticsProvider, AnalyticsProperties, AnalyticsUser } from '@src/services/analytics/types';
import { resolveAppMetricaApiKey } from '@src/services/analytics/apiKey';
import {
  AcquisitionChannel,
  AcquisitionTracker,
  defaultTrackerForChannel,
} from '@src/services/analytics/channels';

class RecordingProvider implements AnalyticsProvider {
  readonly name = 'recording';
  events: Array<{ event: string; props?: AnalyticsProperties }> = [];
  users: Array<AnalyticsUser | null> = [];
  revenues: unknown[] = [];

  init(): void {}

  track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
    this.events.push({ event: String(event), props: properties });
  }

  setUser(user: AnalyticsUser): void {
    this.users.push(user);
  }

  clearUser(): void {
    this.users.push(null);
  }

  reportRevenue(revenue: unknown): void {
    this.revenues.push(revenue);
  }
}

describe('Analytics Layer', () => {
  it('tracks via mock provider with normalized common fields', () => {
    const rec = new RecordingProvider();
    analytics.resetForTests([rec]);
    analytics.setRole('master');
    analytics.track(AnalyticsEvent.SubscriptionScreenOpened, { screen: 'subscriptions' });

    expect(rec.events).toHaveLength(1);
    expect(rec.events[0].event).toBe('subscription_screen_opened');
    expect(rec.events[0].props?.platform).toBeTruthy();
    expect(rec.events[0].props?.environment).toBeTruthy();
    expect(rec.events[0].props?.app_version).toBeTruthy();
    expect(rec.events[0].props?.build_number).toBeTruthy();
    expect(rec.events[0].props?.role).toBe('master');
    expect(rec.events[0].props?.screen).toBe('subscriptions');
  });

  it('setUser then clearUser; account switch clears previous', () => {
    const rec = new RecordingProvider();
    analytics.resetForTests([rec]);
    analytics.setUser({ id: 1, role: 'master' });
    analytics.setUser({ id: 2, role: 'client' });
    analytics.clearUser();

    expect(rec.users[0]).toEqual({ id: '1', role: 'master' });
    expect(rec.users[1]).toBeNull();
    expect(rec.users[2]).toEqual({ id: '2', role: 'client' });
    expect(rec.users[3]).toBeNull();
  });

  it('strips PII keys from properties', () => {
    const cleaned = sanitizeAnalyticsProperties({
      phone: '+7999',
      email: 'a@b.c',
      promo_code: 'SECRET',
      hasPromo: true,
      paymentId: 'pub-1',
    });
    expect(cleaned.phone).toBeUndefined();
    expect(cleaned.email).toBeUndefined();
    expect(cleaned.promo_code).toBeUndefined();
    expect(cleaned.hasPromo).toBe(true);
    expect(cleaned.paymentId).toBe('pub-1');
  });

  it('works with NoOp provider when API key missing', () => {
    analytics.resetForTests([new NoOpAnalyticsProvider()]);
    expect(() => {
      analytics.track(AnalyticsEvent.AppMetricaIntegrationTest);
      analytics.setUser({ id: 42 });
      analytics.clearUser();
      analytics.reportRevenue({ price: 100, currency: 'RUB' });
    }).not.toThrow();
  });

  it('system fields win over user params', () => {
    const common = buildCommonAnalyticsContext('master');
    const merged = mergeEventProperties(common, {
      platform: 'hacked',
      role: 'admin',
      screen: 'subscriptions',
    } as AnalyticsProperties);
    expect(merged.platform).toBe(common.platform);
    expect(merged.role).toBe('master');
    expect(merged.screen).toBe('subscriptions');
  });

  it('resolveAppMetricaApiKey does not throw without key', () => {
    expect(() => resolveAppMetricaApiKey()).not.toThrow();
  });
});

describe('paymentPublicStatus verify states', () => {
  it('success only when paid+applied', () => {
    expect(
      resolvePaymentVerifyState({
        kind: 'ok',
        data: { status: 'paid', subscription_apply_status: 'applied' },
      })
    ).toBe('success');
  });

  it('paid + null/empty apply is activating, not success', () => {
    expect(
      resolvePaymentVerifyState({
        kind: 'ok',
        data: { status: 'paid', subscription_apply_status: null },
      })
    ).toBe('activating');
    expect(
      resolvePaymentVerifyState({
        kind: 'ok',
        data: { status: 'paid', subscription_apply_status: '' },
      })
    ).toBe('activating');
  });

  it('pending is not success', () => {
    expect(
      resolvePaymentVerifyState({
        kind: 'ok',
        data: { status: 'pending', subscription_apply_status: 'pending' },
      })
    ).toBe('pending');
  });

  it('expired maps to expired', () => {
    expect(
      resolvePaymentVerifyState({
        kind: 'ok',
        data: { status: 'expired', subscription_apply_status: 'pending' },
      })
    ).toBe('expired');
  });
});

describe('acquisition channels', () => {
  it('Google Play and RuStore use different trackers', () => {
    expect(defaultTrackerForChannel(AcquisitionChannel.GooglePlay)).toBe(
      AcquisitionTracker.GooglePlay
    );
    expect(defaultTrackerForChannel(AcquisitionChannel.RuStore)).toBe(
      AcquisitionTracker.RuStore
    );
    expect(defaultTrackerForChannel(AcquisitionChannel.GooglePlay)).not.toBe(
      defaultTrackerForChannel(AcquisitionChannel.RuStore)
    );
  });
});
