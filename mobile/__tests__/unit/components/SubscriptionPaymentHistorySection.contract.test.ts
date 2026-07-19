/**
 * Component-level behaviour via pure section model + nested modal contracts.
 */
import {
  buildPaymentHistorySectionModel,
  resolvePaymentHistoryBackAction,
} from '@src/utils/paymentHistorySectionModel';
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
  it('empty → empty copy, no show-all', () => {
    const model = buildPaymentHistorySectionModel([]);
    expect(model.showEmpty).toBe(true);
    expect(model.showAllButton).toBe(false);
  });

  it('single item shows «Вся история (1)» and compact preview without date', () => {
    const model = buildPaymentHistorySectionModel([item]);
    expect(model.showAllButtonLabel).toBe('Вся история (1)');
    expect(model.preview[0].planDurationLabel).toBe('Premium · 3 месяца');
    expect(model.preview[0].previewAccessibilityLabel).not.toMatch(/2026/);
  });

  it('status tap opens details model with points tones', () => {
    const row = buildPaymentHistorySectionModel([item]).preview[0];
    expect(row.statusAccessibilityLabel).toContain('Оплачен');
    expect(row.detailFields.find((f) => f.key === 'points_spent')?.tone).toBe('spent');
    expect(row.detailFields.find((f) => f.key === 'points_earned')?.tone).toBe('earned');
  });

  it('nested back: detail then list', () => {
    expect(resolvePaymentHistoryBackAction({ detailVisible: true, listVisible: true })).toBe(
      'close-detail'
    );
    expect(resolvePaymentHistoryBackAction({ detailVisible: false, listVisible: true })).toBe(
      'close-list'
    );
  });

  it('full list row can open same detail payload without refetch', () => {
    const model = buildPaymentHistorySectionModel([item]);
    const fromPreview = model.preview[0];
    const fromMap = model.rowsById[fromPreview.id];
    expect(fromMap.detailFields).toEqual(fromPreview.detailFields);
  });
});
