const activate = jest.fn();
const reportEvent = jest.fn();
const setUserProfileID = jest.fn();
const reportRevenue = jest.fn();
const reportError = jest.fn();

jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (value: Record<string, unknown>) => value.ios },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '1.0.0', ios: { buildNumber: '2' } },
    nativeAppVersion: '1.0.0',
    nativeBuildVersion: '2',
  },
}));

jest.mock('@appmetrica/react-native-analytics', () => ({
  __esModule: true,
  default: {
    activate,
    reportEvent,
    setUserProfileID,
    reportRevenue,
    reportError,
  },
}));

import { AnalyticsEvent } from '@src/services/analytics/events';
import { AppMetricaProvider } from '@src/services/analytics/providers/AppMetricaProvider';
import {
  normalizeAnalyticsUserId,
  sanitizeAnalyticsProperties,
} from '@src/services/analytics/normalize';

describe('AppMetrica privacy invariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function initializedProvider(): Promise<AppMetricaProvider> {
    const provider = new AppMetricaProvider('test-api-key');
    await provider.init();
    return provider;
  }

  it('disables advertising identifiers, location and automatic revenue tracking', async () => {
    await initializedProvider();

    expect(activate).toHaveBeenCalledWith(
      expect.objectContaining({
        advIdentifiersTracking: false,
        locationTracking: false,
        revenueAutoTrackingEnabled: false,
        crashReporting: true,
        nativeCrashReporting: true,
      })
    );
  });

  it('accepts only a positive backend numeric id and clears it on logout', async () => {
    const provider = await initializedProvider();

    provider.setUser({ id: 42 });
    provider.setUser({ id: '+79990000000' });
    provider.setUser({ id: 'person@example.com' });
    provider.clearUser();

    expect(setUserProfileID.mock.calls).toEqual([['42'], [undefined]]);
    expect(normalizeAnalyticsUserId('00042')).toBeNull();
  });

  it('drops PII, credentials and Apple transaction fields from event properties', async () => {
    const provider = await initializedProvider();

    provider.track(AnalyticsEvent.SubscriptionPaymentSuccess, {
      screen: 'subscriptions',
      phone: '+79990000000',
      Email: 'person@example.com',
      full_name: 'Иван Иванов',
      accessToken: 'secret',
      signedTransaction: 'eyJabc.def.ghi',
      transaction_id: '2000000123456789',
      originalTransactionId: '2000000123450000',
      app_account_token: '00000000-0000-0000-0000-000000000000',
    } as never);

    expect(reportEvent).toHaveBeenCalledWith('subscription_payment_success', {
      screen: 'subscriptions',
    });
  });

  it('sanitizes manual revenue payload and rejects an unsafe product id', async () => {
    const provider = await initializedProvider();

    provider.reportRevenue({
      price: 990,
      currency: 'RUB',
      productID: 'person@example.com',
      payload: {
        planMonths: 1,
        transactionId: '2000000123456789',
        token: 'secret',
      },
    });

    expect(reportRevenue).toHaveBeenCalledWith({
      price: 990,
      currency: 'RUB',
      productID: undefined,
      quantity: 1,
      payload: JSON.stringify({ planMonths: 1 }),
    });
  });

  it('redacts PII and credentials from SDK error reports', async () => {
    const provider = await initializedProvider();

    provider.reportError(
      'checkout.failed',
      'user person@example.com phone=+7 999 000-00-00 token=secret Bearer eyJabc.def.ghi'
    );

    expect(reportError).toHaveBeenCalledTimes(1);
    const [identifier, message] = reportError.mock.calls[0];
    expect(identifier).toBe('checkout.failed');
    expect(message).not.toContain('person@example.com');
    expect(message).not.toContain('+7 999 000-00-00');
    expect(message).not.toContain('eyJabc.def.ghi');
    expect(message).not.toContain('token=secret');
    expect(message).toContain('[REDACTED_');
  });

  it('normalizes blocked keys across case and separators', () => {
    expect(
      sanitizeAnalyticsProperties({
        APP_ACCOUNT_TOKEN: 'uuid',
        Original_Transaction_ID: 'tx',
        signedRenewalInfo: 'jws',
        safe: true,
      } as never)
    ).toEqual({ safe: true });
  });
});
