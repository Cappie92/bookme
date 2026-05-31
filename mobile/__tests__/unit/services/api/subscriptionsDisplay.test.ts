import {
  getDisplayDaysRemaining,
  getDaysRemaining,
  Subscription,
  SubscriptionStatus,
  SubscriptionType,
} from '@src/services/api/subscriptions';

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
});
