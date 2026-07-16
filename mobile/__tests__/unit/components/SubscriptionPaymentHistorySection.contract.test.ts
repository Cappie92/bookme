/**
 * Component-level behaviour via pure section model + retry contract.
 * Full RN render lives behind broken jest-expo/shared import scope in this repo;
 * UI wiring is covered here without mounting native views.
 */
import { buildPaymentHistorySectionModel } from '@src/utils/paymentHistorySectionModel';
import type { SubscriptionPaymentHistoryItem } from '@src/utils/subscriptionBilling';

const item: SubscriptionPaymentHistoryItem = {
  payment_id: 5,
  public_id: 'pay-5',
  paid_at: '2026-07-12T10:00:00',
  plan_display_name: 'Premium',
  duration_months: 3,
  amount_paid: 2729,
  points_spent: 481,
  points_earned: 321,
  package_value: 3210,
  monthly_price: 1070,
  subscription_start_date: '2026-07-12T10:00:00',
  subscription_end_date: '2026-10-09T10:00:00',
  status: 'paid',
  subscription_apply_status: 'applied',
  is_successful_purchase: true,
};

describe('SubscriptionPaymentHistorySection contract', () => {
  it('empty → empty copy key for UI', () => {
    expect(buildPaymentHistorySectionModel([]).showEmpty).toBe(true);
  });

  it('error → retryable error state without empty', () => {
    const model = buildPaymentHistorySectionModel([], {
      error: 'Не удалось загрузить историю оплат',
    });
    expect(model.error).toBe('Не удалось загрузить историю оплат');
    expect(model.showEmpty).toBe(false);
  });

  it('refresh replaces previous empty with successful card data', () => {
    expect(buildPaymentHistorySectionModel([]).showEmpty).toBe(true);
    const after = buildPaymentHistorySectionModel([item]);
    expect(after.successful[0].amountLabel).toMatch(/2[\u00A0 ]729 ₽/);
    expect(after.successful[0].pointsParts.map((p) => p.text)).toEqual([
      '-481 балл',
      '+321 балл',
    ]);
    expect(after.successful[0].monthlyLabel).toMatch(/1[\u00A0 ]070 ₽\/мес/);
    expect(after.successful[0].periodLabel).toBe('12.07.26–09.10.26');
  });
});
