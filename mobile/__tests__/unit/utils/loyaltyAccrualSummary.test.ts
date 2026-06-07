import {
  formatLoyaltyAccrualSummaryLines,
  formatLoyaltyAccrualSummaryText,
} from '@src/utils/loyaltyAccrualSummary';

describe('formatLoyaltyAccrualSummary', () => {
  it('returns disabled message with saved settings when program is off', () => {
    const lines = formatLoyaltyAccrualSummaryLines({
      is_enabled: false,
      accrual_percent: 5,
      max_payment_percent: 50,
      points_lifetime_days: 30,
    });
    expect(lines[0]).toBe('Программа лояльности выключена');
    expect(lines).toContain('5% от стоимости услуги начисляется баллами');
  });

  it('returns only disabled line when nothing saved', () => {
    expect(
      formatLoyaltyAccrualSummaryLines({
        is_enabled: false,
        accrual_percent: null,
        max_payment_percent: null,
        points_lifetime_days: null,
      })
    ).toEqual(['Программа лояльности выключена']);
  });

  it('formats enabled settings from API fields', () => {
    const lines = formatLoyaltyAccrualSummaryLines({
      is_enabled: true,
      accrual_percent: 10,
      max_payment_percent: 50,
      points_lifetime_days: 180,
    });
    expect(lines[0]).toBe('10% от стоимости услуги начисляется баллами');
    expect(lines[1]).toBe('До 50% услуги можно оплатить баллами');
    expect(lines[2]).toBe('Срок действия баллов: 180 дней');
    expect(lines[lines.length - 1]).toBe('Баллы начисляются после завершения записи');
  });

  it('joins lines for collapsed preview', () => {
    const text = formatLoyaltyAccrualSummaryText({
      is_enabled: true,
      accrual_percent: 5,
      max_payment_percent: null,
      points_lifetime_days: null,
    });
    expect(text).toContain('5% от стоимости услуги');
    expect(text).toContain('без ограничения');
  });
});
