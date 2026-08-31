import type { SubscriptionAccessSummary } from '@src/services/api/subscriptions';
import { loadIosAccessState, resolveIosAccessState } from '@src/utils/iosAccessState';

function summary(
  accessLevel: SubscriptionAccessSummary['access_level'],
  planName: string,
  overrides: Partial<SubscriptionAccessSummary> = {}
): SubscriptionAccessSummary {
  return {
    access_level: accessLevel,
    plan_name: planName,
    plan_display_name: planName,
    status: 'active',
    is_active: true,
    end_date: accessLevel === 'paid' ? '2026-12-31T00:00:00Z' : null,
    is_always_free: accessLevel === 'always_free',
    features: {
      has_booking_page: true,
      has_unlimited_bookings: accessLevel !== 'free',
      has_extended_stats: accessLevel !== 'free',
      has_loyalty_access: accessLevel !== 'free',
      has_finance_access: accessLevel !== 'free',
      has_client_restrictions: accessLevel !== 'free',
      can_customize_domain: accessLevel !== 'free',
      has_clients_access: accessLevel !== 'free',
      max_page_modules: accessLevel === 'free' ? 0 : 7,
      stats_retention_days: accessLevel === 'free' ? 30 : 0,
    },
    current_active_bookings: 4,
    max_future_bookings: accessLevel === 'free' ? 20 : null,
    is_unlimited: accessLevel !== 'free',
    ...overrides,
  };
}

describe('iOS access state model', () => {
  it('resolves real Free access with limit 20', () => {
    const state = resolveIosAccessState(summary('free', 'Free'));
    expect(state.kind).toBe('READY_FREE');
    if (state.kind === 'READY_FREE') {
      expect(state.summary.max_future_bookings).toBe(20);
      expect(state.summary.is_unlimited).toBe(false);
    }
  });

  it.each(['Pro', 'Premium'])('resolves paid %s without a Free fallback', (planName) => {
    const state = resolveIosAccessState(summary('paid', planName));
    expect(state.kind).toBe('READY_PAID');
    if (state.kind === 'READY_PAID') expect(state.summary.plan_name).toBe(planName);
  });

  it('resolves null-subscription AlwaysFree backend evidence as unlimited', () => {
    const state = resolveIosAccessState(summary('always_free', 'AlwaysFree'));
    expect(state.kind).toBe('READY_ALWAYS_FREE');
    if (state.kind === 'READY_ALWAYS_FREE') {
      expect(state.summary.is_always_free).toBe(true);
      expect(state.summary.is_unlimited).toBe(true);
      expect(state.summary.max_future_bookings).toBeNull();
    }
  });

  it.each([
    'subscription access lookup error',
    'feature lookup error',
    'booking-limit lookup error',
  ])('%s produces ERROR without a fabricated Free state', async () => {
    const state = await loadIosAccessState(async () => {
      throw new Error('backend unavailable');
    });
    expect(state.kind).toBe('ERROR');
    expect(state).not.toHaveProperty('summary');
    expect(JSON.stringify(state)).not.toMatch(/0\s*\/\s*20|READY_FREE/);
  });

  it('retry recovers the authoritative paid state', async () => {
    const loader = jest
      .fn<Promise<SubscriptionAccessSummary>, []>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(summary('paid', 'Pro'));
    expect((await loadIosAccessState(loader)).kind).toBe('ERROR');
    const recovered = await loadIosAccessState(loader);
    expect(recovered.kind).toBe('READY_PAID');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
