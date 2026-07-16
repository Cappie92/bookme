/**
 * Component-level behaviour via pure section model + modal contracts.
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

  it('refresh replaces previous empty with compact row data', () => {
    expect(buildPaymentHistorySectionModel([]).showEmpty).toBe(true);
    const after = buildPaymentHistorySectionModel([item]);
    expect(after.preview[0].amountLabel).toMatch(/2[\u00A0 ]729 ₽/);
    expect(after.preview[0].pointsCompactLine).toMatch(/−481 \/ \+321 балл/);
    expect(after.preview[0].monthlyLabel).toMatch(/1[\u00A0 ]070 ₽\/мес/);
    expect(after.preview[0].periodLabel).toBe('12.07.26–09.10.26');
    expect(after.showAllButton).toBe(false);
  });

  it('>3 items expose show-all label for modal entry', () => {
    const items = [1, 2, 3, 4].map((n) => ({
      ...item,
      payment_id: n,
      public_id: `pay-${n}`,
      paid_at: `2026-07-${10 + n}T10:00:00`,
    }));
    const model = buildPaymentHistorySectionModel(items);
    expect(model.showAllButton).toBe(true);
    expect(model.showAllButtonLabel).toBe('Показать всю историю (4)');
    expect(model.modalListItems.filter((i) => i.type === 'row')).toHaveLength(4);
  });
});
