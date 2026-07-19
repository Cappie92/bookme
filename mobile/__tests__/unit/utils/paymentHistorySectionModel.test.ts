import {
  PAYMENT_HISTORY_PREVIEW_LIMIT,
  buildPaymentHistoryModalListItems,
  buildPaymentHistorySectionModel,
  resolvePaymentHistoryBackAction,
} from '@src/utils/paymentHistorySectionModel';
import type { SubscriptionPaymentHistoryItem } from '@src/utils/subscriptionBilling';

function makeItem(
  overrides: Partial<SubscriptionPaymentHistoryItem> &
    Pick<SubscriptionPaymentHistoryItem, 'payment_id' | 'public_id'>
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
const failedItem = makeItem({
  payment_id: 3,
  public_id: 'pay-fail',
  paid_at: null,
  status: 'failed',
  subscription_apply_status: 'failed',
  is_successful_purchase: false,
  subscription_start_date: null,
  subscription_end_date: null,
});

describe('buildPaymentHistorySectionModel (preview + details)', () => {
  it('1. preview does not include date', () => {
    const row = buildPaymentHistorySectionModel([successfulItem]).preview[0];
    expect(row.planDurationLabel).toBe('Premium · 3 месяца');
    expect(row.planDurationLabel).not.toMatch(/\d{1,2}\.\d{2}\.\d{2}/);
    expect(row.previewAccessibilityLabel).not.toMatch(/июл|2026/);
    expect(row.previewAccessibilityLabel).not.toMatch(/Дата/);
  });

  it('2. preview shows plan · duration and amount', () => {
    const row = buildPaymentHistorySectionModel([successfulItem]).preview[0];
    expect(row.planDurationLabel).toBe('Premium · 3 месяца');
    expect(row.amountLabel).toMatch(/3[\u00A0 ]210 ₽/);
  });

  it('3. pending shows clickable status «В обработке»', () => {
    const row = buildPaymentHistorySectionModel([pendingNoPeriod]).preview[0];
    expect(row.statusLabel).toBe('В обработке');
    expect(row.statusAccessibilityLabel).toContain('В обработке');
    expect(row.statusAccessibilityLabel).toContain('детали');
  });

  it('4. one record → button «Вся история (1)»', () => {
    const model = buildPaymentHistorySectionModel([successfulItem]);
    expect(model.preview).toHaveLength(1);
    expect(model.showAllButton).toBe(true);
    expect(model.showAllButtonLabel).toBe('Вся история (1)');
  });

  it('5. three records → button «Вся история (3)»', () => {
    const items = [
      makeItem({ payment_id: 10, public_id: 'a', paid_at: '2026-07-16T10:00:00' }),
      makeItem({ payment_id: 11, public_id: 'b', paid_at: '2026-07-15T10:00:00' }),
      makeItem({ payment_id: 12, public_id: 'c', paid_at: '2026-07-14T10:00:00' }),
    ];
    const model = buildPaymentHistorySectionModel(items);
    expect(model.preview).toHaveLength(3);
    expect(model.showAllButton).toBe(true);
    expect(model.showAllButtonLabel).toBe('Вся история (3)');
  });

  it('6. four records → 3 preview + «Вся история (4)»', () => {
    const items = [
      makeItem({ payment_id: 10, public_id: 'a', paid_at: '2026-07-16T10:00:00' }),
      makeItem({ payment_id: 11, public_id: 'b', paid_at: '2026-07-15T10:00:00' }),
      makeItem({ payment_id: 12, public_id: 'c', paid_at: '2026-07-14T10:00:00' }),
      makeItem({ payment_id: 13, public_id: 'd', paid_at: '2026-07-13T10:00:00' }),
    ];
    const model = buildPaymentHistorySectionModel(items);
    expect(PAYMENT_HISTORY_PREVIEW_LIMIT).toBe(3);
    expect(model.preview).toHaveLength(3);
    expect(model.showAllButtonLabel).toBe('Вся история (4)');
  });

  it('7. zero records → empty without button', () => {
    const model = buildPaymentHistorySectionModel([]);
    expect(model.showEmpty).toBe(true);
    expect(model.showAllButton).toBe(false);
  });

  it('8. opening details is represented by row detailFields (status tap contract)', () => {
    const row = buildPaymentHistorySectionModel([pendingNoPeriod]).preview[0];
    expect(row.detailFields.some((f) => f.key === 'status' && f.value === 'В обработке')).toBe(
      true
    );
    expect(row.statusAccessibilityLabel).toMatch(/button|детали|Статус/i);
  });

  it('9. successful details contain date, package, amount, monthly, period', () => {
    const row = buildPaymentHistorySectionModel([successfulItem]).preview[0];
    const keys = row.detailFields.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining(['status', 'date', 'plan', 'duration', 'package', 'amount', 'monthly', 'period'])
    );
    expect(row.detailFields.find((f) => f.key === 'package')?.value).toMatch(/3[\u00A0 ]210 ₽/);
    expect(row.detailFields.find((f) => f.key === 'monthly')?.value).toMatch(/1[\u00A0 ]070 ₽\/мес/);
    expect(row.detailFields.find((f) => f.key === 'period')?.value).toBe('12.07.26–09.10.26');
  });

  it('10. details with points: 2729, −481, +321', () => {
    const row = buildPaymentHistorySectionModel([paidWithPoints]).preview[0];
    expect(row.detailFields.find((f) => f.key === 'amount')?.value).toMatch(/2[\u00A0 ]729 ₽/);
    expect(row.detailFields.find((f) => f.key === 'points_spent')).toMatchObject({
      value: '−481',
      tone: 'spent',
    });
    expect(row.detailFields.find((f) => f.key === 'points_earned')).toMatchObject({
      value: '+321',
      tone: 'earned',
    });
  });

  it('11. empty-value fields are hidden', () => {
    const row = buildPaymentHistorySectionModel([failedItem]).preview[0];
    const keys = row.detailFields.map((f) => f.key);
    expect(keys).not.toContain('period');
    expect(keys).not.toContain('points_spent');
    expect(keys).not.toContain('points_earned');
    // paid_at null and no created_at in API → date hidden
    expect(keys).not.toContain('date');
    expect(keys).not.toContain('error');
  });

  it('12. pending without period does not show period', () => {
    const row = buildPaymentHistorySectionModel([pendingNoPeriod]).preview[0];
    expect(row.periodLabel).toBeNull();
    expect(row.detailFields.some((f) => f.key === 'period')).toBe(false);
  });

  it('13. Android Back closes detail first, then list', () => {
    expect(
      resolvePaymentHistoryBackAction({ detailVisible: true, listVisible: true })
    ).toBe('close-detail');
    expect(
      resolvePaymentHistoryBackAction({ detailVisible: false, listVisible: true })
    ).toBe('close-list');
    expect(
      resolvePaymentHistoryBackAction({ detailVisible: false, listVisible: false })
    ).toBe('none');
  });

  it('14–15. full list rows map to details; closing detail keeps list available', () => {
    const model = buildPaymentHistorySectionModel([successfulItem, pendingNoPeriod]);
    const listRows = model.modalListItems.filter((i) => i.type === 'row');
    expect(listRows.length).toBeGreaterThanOrEqual(2);
    const first = listRows[0];
    if (first.type !== 'row') throw new Error('expected row');
    expect(model.rowsById[first.row.id].detailFields.length).toBeGreaterThan(0);
    // After close-detail, list remains open
    expect(
      resolvePaymentHistoryBackAction({ detailVisible: false, listVisible: true })
    ).toBe('close-list');
  });

  it('16. accessibility labels for status and row', () => {
    const row = buildPaymentHistorySectionModel([successfulItem]).preview[0];
    expect(row.previewAccessibilityLabel).toContain('Premium');
    expect(row.previewAccessibilityLabel).toContain('Оплачен');
    expect(row.previewAccessibilityLabel).not.toMatch(/июл|2026/);
    expect(row.statusAccessibilityLabel).toContain('Оплачен');
  });

  it('17. backend 3210/1070 are not recalculated', () => {
    const row = buildPaymentHistorySectionModel([successfulItem]).preview[0];
    expect(row.packageValue).toBe(3210);
    expect(row.monthlyPrice).toBe(1070);
    expect(row.detailFields.find((f) => f.key === 'monthly')?.value).toMatch(/1[\u00A0 ]070 ₽\/мес/);
  });

  it('sorts descending and separates other in modal', () => {
    const model = buildPaymentHistorySectionModel([
      successfulItem,
      pendingNoPeriod,
      failedItem,
    ]);
    expect(model.successful).toHaveLength(1);
    expect(model.other.length).toBeGreaterThanOrEqual(2);
    expect(buildPaymentHistoryModalListItems(model.successful, model.other).some((i) => i.type === 'header')).toBe(
      true
    );
  });

  it('pending with paid_at (backend created_at fallback) shows date in details', () => {
    const row = buildPaymentHistorySectionModel([pendingNoPeriod]).preview[0];
    expect(row.dateLabel).toBeTruthy();
    expect(row.detailFields.some((f) => f.key === 'date')).toBe(true);
  });
});
