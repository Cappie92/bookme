/**
 * Idempotency + payment verify tests (success/revenue once).
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios },
}));

const memoryStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => memoryStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    memoryStore.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    memoryStore.delete(k);
  }),
  clear: jest.fn(async () => {
    memoryStore.clear();
  }),
  getAllKeys: jest.fn(async () => Array.from(memoryStore.keys())),
}));

const mockGetPaymentPublicStatus = jest.fn();

jest.mock('@src/services/api/payments', () => ({
  getPaymentPublicStatus: (...args: unknown[]) => mockGetPaymentPublicStatus(...args),
}));

import { analytics } from '@src/services/analytics/Analytics';
import { AnalyticsEvent } from '@src/services/analytics/events';
import type { AnalyticsProvider, AnalyticsProperties, AnalyticsRevenue, AnalyticsUser } from '@src/services/analytics/types';
import {
  savePendingSubscriptionPayment,
  clearPendingSubscriptionPayment,
  resetPaymentSuccessClaimsForTests,
} from '@src/services/analytics/pendingSubscriptionPayment';
import {
  verifyPendingSubscriptionPayment,
  resetVerifyInflightForTests,
} from '@src/services/analytics/verifyPendingSubscriptionPayment';
import {
  mergeEventProperties,
  buildCommonAnalyticsContext,
  sanitizeAnalyticsProperties,
  normalizeMoneyAmount,
} from '@src/services/analytics/normalize';
import {
  parseMarketingTouchFromUrl,
  LAST_TOUCH_WINDOW_MS,
  AcquisitionService,
} from '@src/services/analytics/AcquisitionService';

class RecordingProvider implements AnalyticsProvider {
  readonly name = 'recording';
  events: Array<{ event: string; props?: AnalyticsProperties }> = [];
  revenues: AnalyticsRevenue[] = [];

  init(): void {}
  track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
    this.events.push({ event: String(event), props: properties });
  }
  setUser(_user: AnalyticsUser): void {}
  clearUser(): void {}
  reportRevenue(revenue: AnalyticsRevenue): void {
    this.revenues.push(revenue);
  }
}

const pendingBase = {
  publicId: 'pub-pay-1',
  planMonths: 3,
  planFullAmount: 3210,
  cashPaidAmount: 2729,
  pointsUsed: 481,
  currency: 'RUB',
  startedAt: new Date().toISOString(),
  hasPromo: true,
};

async function resetAll() {
  memoryStore.clear();
  resetPaymentSuccessClaimsForTests();
  resetVerifyInflightForTests();
  await clearPendingSubscriptionPayment();
  mockGetPaymentPublicStatus.mockReset();
}

describe('payment verify idempotency', () => {
  let rec: RecordingProvider;

  beforeEach(async () => {
    await resetAll();
    rec = new RecordingProvider();
    analytics.resetForTests([rec]);
    await savePendingSubscriptionPayment(pendingBase);
  });

  it('1. pending → pending: no success/revenue', async () => {
    mockGetPaymentPublicStatus.mockResolvedValue({
      kind: 'ok',
      data: { status: 'pending', subscription_apply_status: 'pending' },
    });
    const r = await verifyPendingSubscriptionPayment({ skipWebReturned: true });
    expect(r.state).toBe('pending');
    expect(rec.events.filter((e) => e.event === AnalyticsEvent.SubscriptionPaymentSuccess)).toHaveLength(0);
    expect(rec.revenues).toHaveLength(0);
  });

  it('2. pending → paid/applied: success+revenue exactly once', async () => {
    mockGetPaymentPublicStatus.mockResolvedValue({
      kind: 'ok',
      data: { status: 'paid', subscription_apply_status: 'applied' },
    });
    const r = await verifyPendingSubscriptionPayment({ skipWebReturned: true });
    expect(r.state).toBe('success');
    expect(r.reportedSuccess).toBe(true);
    expect(r.reportedRevenue).toBe(true);
    expect(rec.events.filter((e) => e.event === AnalyticsEvent.SubscriptionPaymentSuccess)).toHaveLength(1);
    expect(rec.revenues).toHaveLength(1);
    expect(rec.revenues[0].price).toBe(2729);
    expect(rec.revenues[0].currency).toBe('RUB');
  });

  it('2b. cashPaidAmount=0: success event ok, no Revenue', async () => {
    await clearPendingSubscriptionPayment();
    await savePendingSubscriptionPayment({
      ...pendingBase,
      publicId: 'pub-pay-zero-cash',
      cashPaidAmount: 0,
    });
    mockGetPaymentPublicStatus.mockResolvedValue({
      kind: 'ok',
      data: { status: 'paid', subscription_apply_status: 'applied' },
    });
    const r = await verifyPendingSubscriptionPayment({ skipWebReturned: true });
    expect(r.state).toBe('success');
    expect(r.reportedSuccess).toBe(true);
    expect(r.reportedRevenue).toBe(false);
    expect(rec.revenues).toHaveLength(0);
  });

  it('3. repeat verify same paymentId: no second success/revenue', async () => {
    mockGetPaymentPublicStatus.mockResolvedValue({
      kind: 'ok',
      data: { status: 'paid', subscription_apply_status: 'applied' },
    });
    await verifyPendingSubscriptionPayment({ skipWebReturned: true });
    // pending cleared; re-save same id to simulate remount without new checkout
    await savePendingSubscriptionPayment(pendingBase);
    const r2 = await verifyPendingSubscriptionPayment({ skipWebReturned: true });
    expect(r2.state).toBe('success');
    expect(r2.reportedSuccess).toBe(false);
    expect(r2.reportedRevenue).toBe(false);
    expect(rec.events.filter((e) => e.event === AnalyticsEvent.SubscriptionPaymentSuccess)).toHaveLength(1);
    expect(rec.revenues).toHaveLength(1);
  });

  it('4. two concurrent verify same paymentId: success/revenue once', async () => {
    mockGetPaymentPublicStatus.mockResolvedValue({
      kind: 'ok',
      data: { status: 'paid', subscription_apply_status: 'applied' },
    });
    const [a, b] = await Promise.all([
      verifyPendingSubscriptionPayment({ skipWebReturned: true }),
      verifyPendingSubscriptionPayment({ skipWebReturned: true }),
    ]);
    expect(a.state).toBe('success');
    expect(b.state).toBe('success');
    expect(rec.events.filter((e) => e.event === AnalyticsEvent.SubscriptionPaymentSuccess)).toHaveLength(1);
    expect(rec.revenues).toHaveLength(1);
  });

  it('5. failed: no revenue', async () => {
    mockGetPaymentPublicStatus.mockResolvedValue({
      kind: 'ok',
      data: { status: 'failed', subscription_apply_status: 'pending' },
    });
    const r = await verifyPendingSubscriptionPayment({ skipWebReturned: true });
    expect(r.state).toBe('failed');
    expect(rec.revenues).toHaveLength(0);
    expect(rec.events.some((e) => e.event === AnalyticsEvent.SubscriptionPaymentFailed)).toBe(true);
  });

  it('6. expired: no revenue', async () => {
    mockGetPaymentPublicStatus.mockResolvedValue({
      kind: 'ok',
      data: { status: 'expired', subscription_apply_status: 'pending' },
    });
    const r = await verifyPendingSubscriptionPayment({ skipWebReturned: true });
    expect(r.state).toBe('expired');
    expect(rec.revenues).toHaveLength(0);
    expect(rec.events.some((e) => e.event === AnalyticsEvent.SubscriptionPaymentExpired)).toBe(true);
  });

  it('7. web return without backend confirmation: no success/revenue', async () => {
    mockGetPaymentPublicStatus.mockResolvedValue({
      kind: 'ok',
      data: { status: 'pending', subscription_apply_status: 'pending' },
    });
    const r = await verifyPendingSubscriptionPayment({ skipWebReturned: false, source: 'deeplink' });
    expect(r.state).toBe('pending');
    expect(rec.events.some((e) => e.event === AnalyticsEvent.SubscriptionPaymentWebReturned)).toBe(true);
    expect(rec.events.filter((e) => e.event === AnalyticsEvent.SubscriptionPaymentSuccess)).toHaveLength(0);
    expect(rec.revenues).toHaveLength(0);
  });

  it('8. paid but apply pending/null: activating, no success/revenue', async () => {
    mockGetPaymentPublicStatus.mockResolvedValue({
      kind: 'ok',
      data: { status: 'paid', subscription_apply_status: 'pending' },
    });
    const r = await verifyPendingSubscriptionPayment({ skipWebReturned: true });
    expect(r.state).toBe('activating');
    expect(rec.events.filter((e) => e.event === AnalyticsEvent.SubscriptionPaymentSuccess)).toHaveLength(0);
    expect(rec.revenues).toHaveLength(0);
  });
});

describe('normalize / scrubber / money', () => {
  it('system fields win over user params', () => {
    const common = buildCommonAnalyticsContext('master');
    const merged = mergeEventProperties(common, {
      platform: 'hacked',
      environment: 'evil',
      app_version: '9.9.9',
      build_number: '999',
      role: 'admin',
      screen: 'ok',
    });
    expect(merged.platform).toBe(common.platform);
    expect(merged.environment).toBe(common.environment);
    expect(merged.app_version).toBe(common.app_version);
    expect(merged.build_number).toBe(common.build_number);
    expect(merged.role).toBe('master');
    expect(merged.screen).toBe('ok');
  });

  it('sanitize does not mutate input and drops nested/PII', () => {
    const input: AnalyticsProperties = {
      phone: '+7999',
      hasPromo: true,
      nested: { a: 1 } as unknown as string,
    };
    const copy = { ...input };
    const out = sanitizeAnalyticsProperties(input);
    expect(input).toEqual(copy);
    expect(out.phone).toBeUndefined();
    expect(out.hasPromo).toBe(true);
    expect(out.nested).toBeUndefined();
  });

  it('normalizeMoneyAmount rejects NaN/negative', () => {
    expect(normalizeMoneyAmount(NaN)).toBeNull();
    expect(normalizeMoneyAmount(-1)).toBeNull();
    expect(normalizeMoneyAmount(10.456)).toBe(10.46);
  });
});

describe('acquisition parse', () => {
  it('parses utm without storing full URL PII', () => {
    const touch = parseMarketingTouchFromUrl(
      'https://dedato.ru/m/slug?utm_source=yandex&utm_campaign=spring&phone=%2B7999'
    );
    expect(touch).not.toBeNull();
    expect(touch!.source).toBe('yandex');
    expect(touch!.campaign).toBe('spring');
    expect(touch!.deeplink).toBe('/m/*');
    expect(JSON.stringify(touch)).not.toContain('7999');
  });

  it('ignores non-marketing product deeplinks', () => {
    expect(parseMarketingTouchFromUrl('dedato://subscriptions')).toBeNull();
    expect(parseMarketingTouchFromUrl('https://dedato.ru/m/abc')).toBeNull();
  });

  it('last touch expires after 30 days window', async () => {
    await AcquisitionService.clear();
    const old = new Date(Date.now() - LAST_TOUCH_WINDOW_MS - 1000).toISOString();
    await AcquisitionService.recordTouch({
      source: 'yandex',
      campaign: 'old',
      clickTime: old,
    });
    const effective = await AcquisitionService.getEffectiveLastTouch();
    expect(effective).toBeNull();
    const state = await AcquisitionService.getState();
    expect(state.first_touch).not.toBeNull();
  });
});
