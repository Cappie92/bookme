import {
  calculateSubscription,
  getDisplayDaysRemaining,
  getDaysRemaining,
  Subscription,
  SubscriptionStatus,
  SubscriptionType,
} from '@src/services/api/subscriptions';
import { apiClient } from '@src/services/api/client';

function baseSub(overrides: Partial<Subscription> = {}): Subscription {
  const end = new Date();
  end.setDate(end.getDate() + 90);
  return {
    id: 1,
    user_id: 1,
    subscription_type: SubscriptionType.MASTER,
    status: SubscriptionStatus.ACTIVE,
    salon_branches: 0,
    salon_employees: 0,
    master_bookings: 0,
    end_date: end.toISOString(),
    price: 1000,
    auto_renewal: false,
    payment_method: 'card',
    plan_id: 1,
    plan_name: 'Pro',
    ...overrides,
  };
}

describe('getDisplayDaysRemaining', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers API days_remaining over local calendar', () => {
    const sub = baseSub({ days_remaining: 90 });
    expect(getDisplayDaysRemaining(sub)).toBe(90);
  });

  it('falls back to end_date when days_remaining missing', () => {
    const end = new Date();
    end.setDate(end.getDate() + 10);
    const sub = baseSub({ end_date: end.toISOString(), days_remaining: undefined });
    expect(getDisplayDaysRemaining(sub)).toBe(getDaysRemaining(sub.end_date));
  });

  it('returns subscription calculation promo_preview without dropping it', async () => {
    const mockResponse = {
      calculation_id: 7,
      plan_id: 2,
      plan_name: 'Pro',
      duration_months: 3,
      total_price: 9000,
      monthly_price: 3000,
      daily_price: 100,
      price_per_month_display: 3000,
      reserved_balance: 0,
      final_price: 9000,
      upgrade_type: 'immediate',
      new_plan_display_order: 2,
      requires_immediate_payment: true,
      promo_preview: {
        eligible: true,
        points_amount: 1000,
      },
    };
    (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await calculateSubscription({
      plan_id: 2,
      duration_months: 3,
      upgrade_type: 'immediate',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/api/subscriptions/calculate', {
      plan_id: 2,
      duration_months: 3,
      upgrade_type: 'immediate',
    });
    expect(result.promo_preview).toEqual({ eligible: true, points_amount: 1000 });
  });

  it('preserves promo_preview from wrapped calculation response', async () => {
    const mockResponse = {
      calculation: {
        calculation_id: 8,
        plan_id: 2,
        plan_name: 'Pro',
        duration_months: 1,
        total_price: 3000,
        monthly_price: 3000,
        daily_price: 100,
        price_per_month_display: 3000,
        reserved_balance: 0,
        final_price: 3000,
        upgrade_type: 'immediate',
        new_plan_display_order: 2,
        requires_immediate_payment: true,
        promo_preview: null,
      },
      promo_preview: {
        eligible: false,
        ineligible_reason: 'minimum_period_3_months',
      },
    };
    (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await calculateSubscription({
      plan_id: 2,
      duration_months: 1,
      upgrade_type: 'immediate',
    });

    expect(result.calculation_id).toBe(8);
    expect(result.promo_preview).toEqual({
      eligible: false,
      ineligible_reason: 'minimum_period_3_months',
    });
  });

  it('preserves promo_preview from nested calculation response', async () => {
    const mockResponse = {
      calculation: {
        calculation_id: 10,
        plan_id: 2,
        plan_name: 'Pro',
        duration_months: 3,
        total_price: 9000,
        monthly_price: 3000,
        daily_price: 100,
        price_per_month_display: 3000,
        reserved_balance: 0,
        final_price: 9000,
        upgrade_type: 'immediate',
        new_plan_display_order: 2,
        requires_immediate_payment: true,
        promo_preview: {
          eligible: true,
          points_amount: 1000,
        },
      },
    };
    (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await calculateSubscription({
      plan_id: 2,
      duration_months: 3,
      upgrade_type: 'immediate',
    });

    expect(result.calculation_id).toBe(10);
    expect(result.promo_preview).toEqual({
      eligible: true,
      points_amount: 1000,
    });
  });

  it('normalizes camelCase promo preview and boolean eligible from backend response', async () => {
    const mockResponse = {
      calculation_id: 9,
      plan_id: 2,
      plan_name: 'Pro',
      duration_months: 3,
      total_price: 9000,
      monthly_price: 3000,
      daily_price: 100,
      price_per_month_display: 3000,
      reserved_balance: 0,
      final_price: 9000,
      upgrade_type: 'immediate',
      new_plan_display_order: 2,
      requires_immediate_payment: true,
      promoPreview: {
        eligible: 'true',
        points_amount: 1500,
      },
    };
    (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await calculateSubscription({
      plan_id: 2,
      duration_months: 3,
      upgrade_type: 'immediate',
    });

    expect(result.promo_preview).toEqual({
      eligible: true,
      points_amount: 1500,
    });
  });

  it('passes subscription_points_to_use in calculate request', async () => {
    const mockResponse = {
      calculation_id: 11,
      plan_id: 2,
      plan_name: 'Pro',
      duration_months: 1,
      total_price: 1000,
      monthly_price: 1000,
      daily_price: 34,
      price_per_month_display: 1000,
      reserved_balance: 0,
      price_before_points: 1000,
      subscription_points_available: 300,
      subscription_points_used: 300,
      final_price: 700,
      upgrade_type: 'immediate',
      new_plan_display_order: 2,
      requires_immediate_payment: true,
      requires_payment: true,
    };
    (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await calculateSubscription({
      plan_id: 2,
      duration_months: 1,
      upgrade_type: 'immediate',
      subscription_points_to_use: 300,
    });

    expect(apiClient.post).toHaveBeenCalledWith('/api/subscriptions/calculate', {
      plan_id: 2,
      duration_months: 1,
      upgrade_type: 'immediate',
      subscription_points_to_use: 300,
    });
    expect(result.subscription_points_used).toBe(300);
    expect(result.final_price).toBe(700);
  });
});
