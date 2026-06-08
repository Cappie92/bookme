import {
  WELCOME_PERIOD_OPTIONS,
  formatWelcomePlanPrice,
  getWelcomePlanMonthlyRate,
  getWelcomePlanSavings,
  getWelcomePlanTotalPrice,
} from '@src/utils/welcomePricing';
import { WELCOME_PRICING_PLANS } from '@src/data/welcomePricingData';

describe('welcomePricing', () => {
  it('exposes four period options', () => {
    expect(WELCOME_PERIOD_OPTIONS).toEqual([1, 3, 6, 12]);
  });

  it('contains four active master tariffs', () => {
    expect(WELCOME_PRICING_PLANS).toHaveLength(4);
    expect(WELCOME_PRICING_PLANS.map((p) => p.name)).toEqual(['Free', 'Basic', 'Standart', 'Pro']);
  });

  it('uses system Standard (Standart) monthly prices from export config', () => {
    const standart = WELCOME_PRICING_PLANS.find((p) => p.name === 'Standart');
    expect(standart).toBeDefined();
    expect(getWelcomePlanMonthlyRate(standart!, 1)).toBe(800);
    expect(getWelcomePlanMonthlyRate(standart!, 3)).toBe(760);
    expect(getWelcomePlanMonthlyRate(standart!, 6)).toBe(720);
    expect(getWelcomePlanMonthlyRate(standart!, 12)).toBe(680);
  });

  it('returns monthly display price for selected period', () => {
    const basic = WELCOME_PRICING_PLANS.find((p) => p.name === 'Basic')!;
    expect(formatWelcomePlanPrice(basic, 1)).toBe('500 ₽/мес');
    expect(formatWelcomePlanPrice(basic, 12)).toBe('400 ₽/мес');
    expect(formatWelcomePlanPrice(WELCOME_PRICING_PLANS[0], 1)).toBe('Бесплатно');
  });

  it('computes total and savings for multi-month packages', () => {
    const basic = WELCOME_PRICING_PLANS.find((p) => p.name === 'Basic')!;
    expect(getWelcomePlanTotalPrice(basic, 3)).toBe(470 * 3);
    expect(getWelcomePlanSavings(basic, 3)).toEqual({
      savingsRub: 500 * 3 - 470 * 3,
      savingsPercent: 6,
    });
  });
});
