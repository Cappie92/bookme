import { formatMoney } from '@src/utils/money';
import type { WelcomePricingPlan } from '@src/data/welcomePricingData';

export type WelcomePeriodMonths = 1 | 3 | 6 | 12;

export const WELCOME_PERIOD_OPTIONS: WelcomePeriodMonths[] = [1, 3, 6, 12];

/** Помесячная ставка в выбранном пакете (семантика backend: price_Nmonths = ₽/мес в пакете N мес). */
export function getWelcomePlanMonthlyRate(
  plan: WelcomePricingPlan,
  months: WelcomePeriodMonths
): number {
  if (months === 1) return plan.price1Month;
  if (months === 3) return plan.price3Months;
  if (months === 6) return plan.price6Months;
  return plan.price12Months;
}

export function getWelcomePlanTotalPrice(
  plan: WelcomePricingPlan,
  months: WelcomePeriodMonths
): number {
  return Math.ceil(getWelcomePlanMonthlyRate(plan, months)) * months;
}

export function getWelcomePlanSavings(
  plan: WelcomePricingPlan,
  months: WelcomePeriodMonths
): { savingsRub: number; savingsPercent: number } | null {
  if (months <= 1 || plan.price1Month <= 0) return null;
  const baselineRub = Math.round(plan.price1Month * months);
  const totalRub = getWelcomePlanTotalPrice(plan, months);
  const savingsRub = baselineRub - totalRub;
  if (savingsRub <= 0) return null;
  return {
    savingsRub,
    savingsPercent: Math.round((savingsRub / baselineRub) * 100),
  };
}

export function formatWelcomePlanPrice(
  plan: WelcomePricingPlan,
  months: WelcomePeriodMonths
): string {
  const rate = getWelcomePlanMonthlyRate(plan, months);
  if (rate === 0) return 'Бесплатно';
  return `${formatMoney(Math.ceil(rate))}/мес`;
}

export function formatWelcomePeriodLabel(months: WelcomePeriodMonths): string {
  if (months === 1) return '1 месяц';
  if (months === 3) return '3 месяца';
  if (months === 6) return '6 месяцев';
  return '12 месяцев';
}
