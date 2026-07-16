import { buildPaymentHistorySectionModel } from '@src/utils/paymentHistorySectionModel';
import type { SubscriptionPaymentHistoryItem } from '@src/utils/subscriptionBilling';

const successfulItem: SubscriptionPaymentHistoryItem = {
  payment_id: 1,
  public_id: 'pay-1',
  paid_at: '2026-07-14T10:00:00',
  plan_display_name: 'Premium',
  plan_name: 'Premium',
  duration_months: 3,
  amount_paid: 3210,
  points_spent: 0,
  points_earned: 0,
  package_value: 3210,
  monthly_price: 1070,
  subscription_start_date: '2026-07-12T10:00:00',
  subscription_end_date: '2026-10-09T10:00:00',
  status: 'paid',
  subscription_apply_status: 'applied',
  is_successful_purchase: true,
};

const paidWithPoints: SubscriptionPaymentHistoryItem = {
  ...successfulItem,
  payment_id: 2,
  public_id: 'pay-2',
  amount_paid: 2729,
  points_spent: 481,
  points_used: 481,
  points_earned: 321,
};

const failedItem: SubscriptionPaymentHistoryItem = {
  payment_id: 3,
  public_id: 'pay-fail',
  paid_at: '2026-07-13T10:00:00',
  plan_display_name: 'Premium',
  duration_months: 3,
  amount_paid: 3210,
  points_spent: 0,
  points_earned: 0,
  package_value: 3210,
  monthly_price: 1070,
  subscription_start_date: null,
  subscription_end_date: null,
  status: 'failed',
  subscription_apply_status: 'failed',
  is_successful_purchase: false,
};

const cancelledItem: SubscriptionPaymentHistoryItem = {
  ...failedItem,
  payment_id: 4,
  public_id: 'pay-cancel',
  status: 'cancelled',
};

describe('buildPaymentHistorySectionModel', () => {
  it('1. empty history', () => {
    const model = buildPaymentHistorySectionModel([]);
    expect(model.showEmpty).toBe(true);
    expect(model.successful).toHaveLength(0);
    expect(model.other).toHaveLength(0);
  });

  it('2. one successful payment', () => {
    const model = buildPaymentHistorySectionModel([successfulItem]);
    expect(model.showEmpty).toBe(false);
    expect(model.successful).toHaveLength(1);
    expect(model.successful[0].planLabel).toBe('Premium');
    expect(model.successful[0].durationLabel).toBe('3 месяца');
    expect(model.successful[0].statusLabel).toBe('Оплачен');
  });

  it('3. 3 months package 3210 → monthly 1070 from API', () => {
    const card = buildPaymentHistorySectionModel([successfulItem]).successful[0];
    expect(card.monthlyLabel).toMatch(/1[\u00A0 ]070 ₽\/мес/);
    expect(successfulItem.package_value).toBe(3210);
    expect(successfulItem.monthly_price).toBe(1070);
  });

  it('4. payment 2729 ₽ + 481 spent points', () => {
    const card = buildPaymentHistorySectionModel([
      { ...paidWithPoints, points_earned: 0 },
    ]).successful[0];
    expect(card.amountLabel).toMatch(/2[\u00A0 ]729 ₽/);
    expect(card.pointsParts).toEqual([{ text: '-481 балл', tone: 'spent' }]);
  });

  it('5. spent and earned together', () => {
    const card = buildPaymentHistorySectionModel([paidWithPoints]).successful[0];
    expect(card.pointsParts).toEqual([
      { text: '-481 балл', tone: 'spent' },
      { text: '+321 балл', tone: 'earned' },
    ]);
  });

  it('6. points_spent fallback to points_used', () => {
    const card = buildPaymentHistorySectionModel([
      {
        ...paidWithPoints,
        points_spent: undefined,
        points_used: 481,
        points_earned: 0,
      },
    ]).successful[0];
    expect(card.pointsParts[0].text).toBe('-481 балл');
  });

  it('7. correct inclusive period', () => {
    const card = buildPaymentHistorySectionModel([successfulItem]).successful[0];
    expect(card.periodLabel).toBe('12.07.26–09.10.26');
  });

  it('8. failed/cancelled separately under other', () => {
    const model = buildPaymentHistorySectionModel([
      successfulItem,
      failedItem,
      cancelledItem,
    ]);
    expect(model.successful).toHaveLength(1);
    expect(model.other).toHaveLength(2);
    expect(model.other.map((c) => c.id)).toEqual(['pay-fail', 'pay-cancel']);
    expect(model.other[0].statusLabel).toBe('Не прошёл');
    expect(model.other[1].statusLabel).toBe('Отменён');
  });

  it('9. API error state for retry UI', () => {
    const model = buildPaymentHistorySectionModel([], {
      error: 'Не удалось загрузить историю оплат',
    });
    expect(model.error).toBe('Не удалось загрузить историю оплат');
    expect(model.showEmpty).toBe(false);
    expect(model.successful).toHaveLength(0);
  });

  it('10. refresh updates model when items change', () => {
    const empty = buildPaymentHistorySectionModel([]);
    expect(empty.showEmpty).toBe(true);

    const refreshed = buildPaymentHistorySectionModel([successfulItem, paidWithPoints]);
    expect(refreshed.showEmpty).toBe(false);
    expect(refreshed.successful).toHaveLength(2);
    expect(refreshed.successful[1].amountLabel).toMatch(/2[\u00A0 ]729 ₽/);
  });

  it('shows loading without empty', () => {
    const model = buildPaymentHistorySectionModel([], { loading: true });
    expect(model.loading).toBe(true);
    expect(model.showEmpty).toBe(false);
  });
});
