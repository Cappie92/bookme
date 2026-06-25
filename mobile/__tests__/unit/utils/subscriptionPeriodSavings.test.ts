import {
  computePeriodSavings,
  getPlanPeriodSavings,
  getPeriodTotalPrice,
} from '@src/utils/subscriptionPeriodSavings';
import { SubscriptionPlan, SubscriptionType } from '@src/services/api/subscriptions';

const basePlan: SubscriptionPlan = {
  id: 1,
  name: 'premium',
  subscription_type: SubscriptionType.MASTER,
  price_1month: 1160,
  price_3months: 1100,
  price_6months: 1020,
  price_12months: 917,
  features: null,
  limits: null,
  is_active: true,
  display_order: 3,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('computePeriodSavings', () => {
  it('returns rub and percent savings vs monthly price', () => {
    expect(computePeriodSavings(1160, 6, 6120)).toEqual({
      baselineRub: 6960,
      savingsRub: 840,
      savingsPercent: 12,
    });
  });

  it('returns null when there is no discount', () => {
    expect(computePeriodSavings(1160, 1, 1160)).toBeNull();
    expect(computePeriodSavings(1160, 6, 7000)).toBeNull();
  });
});

describe('getPlanPeriodSavings', () => {
  it('uses plan period monthly prices from API', () => {
    expect(getPeriodTotalPrice(basePlan, 6)).toBe(6120);
    expect(getPlanPeriodSavings(basePlan, 6)).toEqual({
      baselineRub: 6960,
      savingsRub: 840,
      savingsPercent: 12,
    });
    expect(getPlanPeriodSavings(basePlan, 1)).toBeNull();
  });

  it('does not show unrealistic savings for period monthly price', () => {
    const basicPlan = {
      ...basePlan,
      price_1month: 500,
      price_3months: 450,
    };

    expect(getPlanPeriodSavings(basicPlan, 3)).toEqual({
      baselineRub: 1500,
      savingsRub: 150,
      savingsPercent: 10,
    });
  });
});
