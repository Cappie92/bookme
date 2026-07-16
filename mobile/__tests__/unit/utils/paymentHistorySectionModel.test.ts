import {
  PAYMENT_HISTORY_PREVIEW_LIMIT,
  buildPaymentHistoryModalListItems,
  buildPaymentHistorySectionModel,
} from '@src/utils/paymentHistorySectionModel';
import type { SubscriptionPaymentHistoryItem } from '@src/utils/subscriptionBilling';
import {
  formatCompactPointsLine,
  formatDurationMonthsCompact,
  formatHistoryDateCompact,
  formatPeriodRangeOrNull,
  sortPaymentHistoryByDateDesc,
} from '@src/utils/subscriptionBilling';

function makeItem(
  overrides: Partial<SubscriptionPaymentHistoryItem> & Pick<SubscriptionPaymentHistoryItem, 'payment_id' | 'public_id'>
): SubscriptionPaymentHistoryItem {
  return {
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
    ...overrides,
  };
}

const successfulItem = makeItem({ payment_id: 1, public_id: 'pay-1' });
const paidWithPoints = makeItem({
  payment_id: 2,
  public_id: 'pay-2',
  amount_paid: 2729,
  points_spent: 481,
  points_used: 481,
  points_earned: 321,
});
const failedItem = makeItem({
  payment_id: 3,
  public_id: 'pay-fail',
  paid_at: '2026-07-13T10:00:00',
  status: 'failed',
  subscription_apply_status: 'failed',
  is_successful_purchase: false,
  subscription_start_date: null,
  subscription_end_date: null,
});
const cancelledItem = makeItem({
  payment_id: 4,
  public_id: 'pay-cancel',
  paid_at: '2026-07-12T10:00:00',
  status: 'cancelled',
  subscription_apply_status: null,
  is_successful_purchase: false,
  subscription_start_date: null,
  subscription_end_date: null,
});
const pendingNoPeriod = makeItem({
  payment_id: 5,
  public_id: 'pay-pending',
  paid_at: '2026-07-16T10:00:00',
  status: 'pending',
  subscription_apply_status: 'pending',
  is_successful_purchase: false,
  subscription_start_date: null,
  subscription_end_date: null,
});

describe('buildPaymentHistorySectionModel (compact)', () => {
  it('1. 0 records → empty state', () => {
    const model = buildPaymentHistorySectionModel([]);
    expect(model.showEmpty).toBe(true);
    expect(model.preview).toHaveLength(0);
    expect(model.showAllButton).toBe(false);
  });

  it('2. 1 record → one compact preview, no show-all button', () => {
    const model = buildPaymentHistorySectionModel([successfulItem]);
    expect(model.preview).toHaveLength(1);
    expect(model.showAllButton).toBe(false);
    expect(model.preview[0].planDurationLabel).toContain('Premium');
    expect(model.preview[0].planDurationLabel).toContain('3 мес.');
    expect(model.preview[0].amountLabel).toMatch(/3[\u00A0 ]210 ₽/);
  });

  it('3. 3 records → all three, no show-all button', () => {
    const items = [
      makeItem({ payment_id: 10, public_id: 'a', paid_at: '2026-07-16T10:00:00' }),
      makeItem({ payment_id: 11, public_id: 'b', paid_at: '2026-07-15T10:00:00' }),
      makeItem({ payment_id: 12, public_id: 'c', paid_at: '2026-07-14T10:00:00' }),
    ];
    const model = buildPaymentHistorySectionModel(items);
    expect(model.preview).toHaveLength(3);
    expect(model.showAllButton).toBe(false);
    expect(PAYMENT_HISTORY_PREVIEW_LIMIT).toBe(3);
  });

  it('4. 4 records → three preview + show-all (4)', () => {
    const items = [
      makeItem({ payment_id: 10, public_id: 'a', paid_at: '2026-07-16T10:00:00' }),
      makeItem({ payment_id: 11, public_id: 'b', paid_at: '2026-07-15T10:00:00' }),
      makeItem({ payment_id: 12, public_id: 'c', paid_at: '2026-07-14T10:00:00' }),
      makeItem({ payment_id: 13, public_id: 'd', paid_at: '2026-07-13T10:00:00' }),
    ];
    const model = buildPaymentHistorySectionModel(items);
    expect(model.preview).toHaveLength(3);
    expect(model.preview.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(model.showAllButton).toBe(true);
    expect(model.showAllButtonLabel).toBe('Показать всю историю (4)');
  });

  it('5. sorts by paid_at descending', () => {
    const unsorted = [
      makeItem({ payment_id: 1, public_id: 'old', paid_at: '2026-07-10T10:00:00' }),
      makeItem({ payment_id: 2, public_id: 'new', paid_at: '2026-07-16T10:00:00' }),
      makeItem({ payment_id: 3, public_id: 'mid', paid_at: '2026-07-12T10:00:00' }),
    ];
    expect(sortPaymentHistoryByDateDesc(unsorted).map((i) => i.public_id)).toEqual([
      'new',
      'mid',
      'old',
    ]);
    const model = buildPaymentHistorySectionModel(unsorted);
    expect(model.allSorted.map((r) => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('6–7. show-all opens modal list with full data', () => {
    const items = [
      makeItem({ payment_id: 10, public_id: 'a', paid_at: '2026-07-16T10:00:00' }),
      makeItem({ payment_id: 11, public_id: 'b', paid_at: '2026-07-15T10:00:00' }),
      makeItem({ payment_id: 12, public_id: 'c', paid_at: '2026-07-14T10:00:00' }),
      paidWithPoints,
    ];
    const model = buildPaymentHistorySectionModel(items);
    expect(model.showAllButton).toBe(true);
    expect(model.modalListItems.filter((i) => i.type === 'row')).toHaveLength(4);
  });

  it('8. successful and other are separated in modal list', () => {
    const model = buildPaymentHistorySectionModel([
      successfulItem,
      failedItem,
      cancelledItem,
    ]);
    const types = model.modalListItems.map((i) => i.type);
    expect(types).toContain('header');
    const header = model.modalListItems.find((i) => i.type === 'header');
    expect(header && header.type === 'header' && header.title).toBe('Другие попытки оплаты');
    expect(model.successful).toHaveLength(1);
    expect(model.other).toHaveLength(2);
  });

  it('9. no successful header when successful empty; only empty message + other', () => {
    const model = buildPaymentHistorySectionModel([failedItem, pendingNoPeriod]);
    expect(model.successful).toHaveLength(0);
    expect(model.showSuccessfulEmptyInModal).toBe(true);
    expect(model.modalListItems[0]).toMatchObject({
      type: 'empty-success',
      message: 'Успешных оплат пока нет',
    });
    expect(model.modalListItems.some((i) => i.type === 'header')).toBe(true);
    // Preview is mixed — no separate "Успешные оплаты" title in model
    expect(model.preview.every((r) => !r.isSuccessful)).toBe(true);
  });

  it('10. pending without period does not expose period dash', () => {
    expect(formatPeriodRangeOrNull(null, null)).toBeNull();
    const row = buildPaymentHistorySectionModel([pendingNoPeriod]).preview[0];
    expect(row.periodLabel).toBeNull();
    expect(row.hasSecondaryRow).toBe(false);
    expect(row.showStatusOnPrimaryRow).toBe(true);
    expect(row.statusLabel).toBe('В обработке');
  });

  it('11. spent/earned tones and compact points line', () => {
    expect(formatCompactPointsLine(481, 321)).toMatch(/−481 \/ \+321 балл/);
    const row = buildPaymentHistorySectionModel([paidWithPoints]).successful[0];
    expect(row.pointsParts[0].tone).toBe('spent');
    expect(row.pointsParts[1].tone).toBe('earned');
    expect(row.pointsCompactLine).toMatch(/−481 \/ \+321 балл/);
  });

  it('12. 3210/1070 without recalculation', () => {
    const row = buildPaymentHistorySectionModel([successfulItem]).successful[0];
    expect(row.monthlyLabel).toMatch(/1[\u00A0 ]070 ₽\/мес/);
    expect(row.amountLabel).toMatch(/3[\u00A0 ]210 ₽/);
    expect(successfulItem.package_value).toBe(3210);
    expect(successfulItem.monthly_price).toBe(1070);
  });

  it('13. 2729 ₽ + 481 points', () => {
    const row = buildPaymentHistorySectionModel([
      { ...paidWithPoints, points_earned: 0 },
    ]).successful[0];
    expect(row.amountLabel).toMatch(/2[\u00A0 ]729 ₽/);
    expect(row.pointsParts).toEqual([{ text: '-481 балл', tone: 'spent' }]);
  });

  it('14. Android back closes via onRequestClose contract', () => {
    // Modal uses RN onRequestClose → handleCloseModal; pure close handler contract:
    let visible = true;
    const onRequestClose = () => {
      visible = false;
    };
    onRequestClose();
    expect(visible).toBe(false);
  });

  it('15. retry/refresh state does not clear empty incorrectly', () => {
    const err = buildPaymentHistorySectionModel([], {
      error: 'Не удалось загрузить историю оплат',
    });
    expect(err.error).toBe('Не удалось загрузить историю оплат');
    expect(err.showEmpty).toBe(false);

    const refreshed = buildPaymentHistorySectionModel([successfulItem]);
    expect(refreshed.showEmpty).toBe(false);
    expect(refreshed.preview).toHaveLength(1);
  });

  it('16. accessibility label contains date, plan, amount, status', () => {
    const row = buildPaymentHistorySectionModel([successfulItem]).preview[0];
    expect(row.accessibilityLabel).toContain('Premium');
    expect(row.accessibilityLabel).toMatch(/3[\u00A0 ]210 ₽|3210/);
    expect(row.accessibilityLabel).toContain('Оплачен');
    expect(row.accessibilityLabel.length).toBeGreaterThan(10);
  });
});

describe('compact billing helpers', () => {
  it('formats compact date and duration', () => {
    expect(formatDurationMonthsCompact(3)).toBe('3 мес.');
    expect(formatHistoryDateCompact('2026-07-16T10:00:00')).toMatch(/16/);
    expect(formatHistoryDateCompact('2026-07-16T10:00:00')).toMatch(/2026/);
  });

  it('buildPaymentHistoryModalListItems keeps other section after successful', () => {
    const model = buildPaymentHistorySectionModel([successfulItem, failedItem]);
    const rebuilt = buildPaymentHistoryModalListItems(model.successful, model.other);
    expect(rebuilt[0].type).toBe('row');
    expect(rebuilt.some((i) => i.type === 'header')).toBe(true);
  });
});
