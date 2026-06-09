import {
  WELCOME_PERIOD_OPTIONS,
  formatWelcomePlanDiscountSuffix,
  formatWelcomePlanPricePerMonth,
  formatWelcomePlanPricePerMonthLabel,
  getWelcomePlanMonthlyRate,
  getWelcomePlanSavings,
  getWelcomePlanTotalPrice,
  getWelcomePlanFeatures,
} from '@src/utils/welcomePricing';
import { WELCOME_PRICING_FALLBACK_PLANS } from '@src/data/welcomePricingData';

describe('welcomePricing helpers', () => {
  const pro = () => WELCOME_PRICING_FALLBACK_PLANS.find((p) => p.name === 'Pro')!;

  it('exposes four period options', () => {
    expect(WELCOME_PERIOD_OPTIONS).toEqual([1, 3, 6, 12]);
  });

  it('fallback catalog has four tariffs', () => {
    expect(WELCOME_PRICING_FALLBACK_PLANS).toHaveLength(4);
  });

  it('computes monthly rate and total from mapped plans', () => {
    const basic = WELCOME_PRICING_FALLBACK_PLANS.find((p) => p.name === 'Basic')!;
    expect(getWelcomePlanMonthlyRate(basic, 1)).toBe(500);
    expect(getWelcomePlanTotalPrice(basic, 3)).toBe(460 * 3);
    expect(getWelcomePlanSavings(basic, 3)).toEqual({
      savingsRub: 500 * 3 - 460 * 3,
      savingsPercent: 8,
    });
  });

  it('returns features for plan id from plans array', () => {
    expect(getWelcomePlanFeatures('premium', WELCOME_PRICING_FALLBACK_PLANS)).toContain('Лояльность');
    expect(formatWelcomePlanPricePerMonth(WELCOME_PRICING_FALLBACK_PLANS[0], 1)).toBe('Бесплатно');
  });

  it('does not show discount suffix for 1 month', () => {
    expect(formatWelcomePlanDiscountSuffix(pro(), 1)).toBeNull();
    expect(formatWelcomePlanPricePerMonthLabel(pro(), 1)).toBe('760 ₽/мес');
  });

  it('shows discount suffix inline for 3/6/12 months', () => {
    expect(formatWelcomePlanDiscountSuffix(pro(), 3)).toBe('(-8%)');
    expect(formatWelcomePlanDiscountSuffix(pro(), 6)).toBe('(-12%)');
    expect(formatWelcomePlanDiscountSuffix(pro(), 12)).toBe('(-24%)');
    expect(formatWelcomePlanPricePerMonthLabel(pro(), 3)).toBe('700 ₽/мес (-8%)');
    expect(formatWelcomePlanPricePerMonthLabel(pro(), 12)).toBe('580 ₽/мес (-24%)');
  });

  it('does not show discount for free plan', () => {
    const free = WELCOME_PRICING_FALLBACK_PLANS[0];
    expect(formatWelcomePlanDiscountSuffix(free, 12)).toBeNull();
    expect(formatWelcomePlanPricePerMonthLabel(free, 12)).toBe('Бесплатно');
  });
});
