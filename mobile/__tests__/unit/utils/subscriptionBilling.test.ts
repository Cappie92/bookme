import {
  computeMonthlyPrice,
  formatCompactPointsLine,
  formatDurationMonthsCompact,
  formatDurationMonthsLabel,
  formatPaidAmountWithPoints,
  formatPaymentBreakdown,
  formatPeriodRange,
  formatPeriodRangeOrNull,
  formatPointsWord,
  formatPricePerMonth,
  isSuccessfulSubscriptionPayment,
  resolvePointsSpent,
  resolveSubscriptionCostDisplay,
  sortPaymentHistoryByDateDesc,
  splitPaymentHistory,
} from '@src/utils/subscriptionBilling';

describe('subscriptionBilling', () => {
  it('does not derive monthly price from subscription.price when billing fields are missing', () => {
    const display = resolveSubscriptionCostDisplay({
      price: 1160,
      duration_months: 3,
      monthly_price: null,
      package_value: null,
    });
    expect(display.monthlyLabel).toBe('—');
    expect(display.packageSummary).toBeNull();
  });

  it('uses API monthly_price for 3 months package 3210 → 1070 ₽/мес', () => {
    const display = resolveSubscriptionCostDisplay({
      duration_months: 3,
      package_value: 3210,
      monthly_price: 1070,
    });
    expect(display.monthlyLabel).toMatch(/1[\u00A0 ]070 ₽\/мес/);
    expect(display.packageSummary).toMatch(/Пакет: 3 месяца за 3[\u00A0 ]210 ₽/);
    expect(computeMonthlyPrice(3210, 3)).toBe(1070);
  });

  it('formats monthly price with cents when needed', () => {
    expect(computeMonthlyPrice(3500, 3)).toBe(1166.67);
    expect(formatPricePerMonth(1166.67)).toMatch(/1[\u00A0 ]166,67 ₽\/мес/);
    expect(formatPricePerMonth(1070)).toMatch(/1[\u00A0 ]070 ₽\/мес/);
  });

  it('shows payment 2729 with 481 spent points', () => {
    expect(formatPaymentBreakdown(2729, 481)).toMatch(
      /Оплачено деньгами 2[\u00A0 ]729 ₽ \+ 481 баллов/
    );
  });

  it('formatPaidAmountWithPoints builds spent and earned parts together', () => {
    const both = formatPaidAmountWithPoints(2729, 481, 321);
    expect(both.amountLabel).toMatch(/2[\u00A0 ]729 ₽/);
    expect(both.parts).toEqual([
      { text: '-481 балл', tone: 'spent' },
      { text: '+321 балл', tone: 'earned' },
    ]);

    const spentOnly = formatPaidAmountWithPoints(2729, 481, 0);
    expect(spentOnly.parts).toHaveLength(1);
    expect(spentOnly.parts[0].tone).toBe('spent');

    const earnedOnly = formatPaidAmountWithPoints(3210, 0, 321);
    expect(earnedOnly.parts).toHaveLength(1);
    expect(earnedOnly.parts[0].tone).toBe('earned');

    const none = formatPaidAmountWithPoints(3210, 0, 0);
    expect(none.parts).toHaveLength(0);
  });

  it('points_spent falls back to points_used for compatibility', () => {
    expect(resolvePointsSpent({ points_used: 481 })).toBe(481);
    expect(resolvePointsSpent({ points_spent: 200, points_used: 481 })).toBe(200);
    expect(resolvePointsSpent({ points_spent: 0, points_used: 481 })).toBe(0);
  });

  it('plural forms: балл / балла / баллов', () => {
    expect(formatPointsWord(1)).toBe('балл');
    expect(formatPointsWord(21)).toBe('балл');
    expect(formatPointsWord(2)).toBe('балла');
    expect(formatPointsWord(4)).toBe('балла');
    expect(formatPointsWord(5)).toBe('баллов');
    expect(formatPointsWord(11)).toBe('баллов');
    expect(formatPointsWord(14)).toBe('баллов');
    expect(formatPointsWord(481)).toBe('балл');
  });

  it('formatPeriodRange uses inclusive end from API without subtracting a day', () => {
    expect(formatPeriodRange('2026-07-12T10:00:00', '2026-10-09T10:00:00')).toBe(
      '12.07.26–09.10.26'
    );
    expect(formatPeriodRange('2026-07-12T10:00:00', '2026-10-10T10:00:00')).toBe(
      '12.07.26–10.10.26'
    );
    expect(formatPeriodRange(null, '2026-10-10T10:00:00')).toBe('—');
  });

  it('formatDurationMonthsLabel', () => {
    expect(formatDurationMonthsLabel(1)).toBe('1 месяц');
    expect(formatDurationMonthsLabel(3)).toBe('3 месяца');
    expect(formatDurationMonthsLabel(12)).toBe('12 месяцев');
  });

  it('splits successful and failed/cancelled payments', () => {
    const items = [
      { status: 'paid', subscription_apply_status: 'applied', is_successful_purchase: true },
      { status: 'pending', subscription_apply_status: 'pending' },
      { status: 'failed', subscription_apply_status: 'failed' },
      { status: 'cancelled', subscription_apply_status: null },
    ];
    const { successful, other } = splitPaymentHistory(items);
    expect(successful).toHaveLength(1);
    expect(other).toHaveLength(3);
    expect(isSuccessfulSubscriptionPayment(successful[0])).toBe(true);
    expect(isSuccessfulSubscriptionPayment(other[0])).toBe(false);
    expect(isSuccessfulSubscriptionPayment(other[1])).toBe(false);
  });

  it('points_earned does not affect package/monthly display helpers', () => {
    const display = resolveSubscriptionCostDisplay({
      duration_months: 3,
      package_value: 3210,
      monthly_price: 1070,
      amount_paid: 2729,
      points_used: 481,
    });
    expect(display.monthlyLabel).toMatch(/1070 ₽\/мес|1[\u00A0 ]070 ₽\/мес/);
    expect(display.packageSummary).toMatch(/3210|3[\u00A0 ]210/);
    // earned is not an input to resolveSubscriptionCostDisplay
  });

  it('formatPeriodRangeOrNull hides missing period', () => {
    expect(formatPeriodRangeOrNull(null, null)).toBeNull();
    expect(formatPeriodRangeOrNull('2026-07-12T10:00:00', '2026-10-09T10:00:00')).toBe(
      '12.07.26–09.10.26'
    );
  });

  it('formatCompactPointsLine and duration compact', () => {
    expect(formatCompactPointsLine(481, 321)).toBe('−481 / +321 балл');
    expect(formatDurationMonthsCompact(3)).toBe('3 мес.');
  });

  it('sortPaymentHistoryByDateDesc orders newest first', () => {
    const items = [
      { payment_id: 1, paid_at: '2026-07-10T10:00:00' },
      { payment_id: 2, paid_at: '2026-07-16T10:00:00' },
    ];
    expect(sortPaymentHistoryByDateDesc(items).map((i) => i.payment_id)).toEqual([2, 1]);
  });
});
