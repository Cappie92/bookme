import { formatMoney } from '@src/utils/money';
import type { WelcomePricingPlan } from '@src/data/welcomePricingData';

export type WelcomePeriodMonths = 1 | 3 | 6 | 12;

export const WELCOME_PERIOD_OPTIONS: WelcomePeriodMonths[] = [1, 3, 6, 12];

export function findWelcomePricingPlan(
  plans: WelcomePricingPlan[],
  planId: string
): WelcomePricingPlan | undefined {
  return plans.find((p) => p.id === planId);
}

export function getWelcomePlanFeatures(
  planId: string,
  plans: WelcomePricingPlan[]
): string[] {
  return findWelcomePricingPlan(plans, planId)?.featuresIncluded ?? [];
}

/** Помесячная ставка в выбранном пакете (семантика backend / web Pricing). */
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
  if (rate === 0) return '0 ₽';
  return `${formatMoney(Math.ceil(rate))}`;
}

export function formatWelcomePlanPricePerMonth(
  plan: WelcomePricingPlan,
  months: WelcomePeriodMonths
): string {
  const rate = getWelcomePlanMonthlyRate(plan, months);
  if (rate === 0) return 'Бесплатно';
  return `${formatMoney(Math.ceil(rate))}/мес`;
}

/** Скидка в скобках для 3/6/12 мес, например `(-8%)`. Для 1 мес — null. */
export function formatWelcomePlanDiscountSuffix(
  plan: WelcomePricingPlan,
  months: WelcomePeriodMonths
): string | null {
  if (months <= 1) return null;
  const savings = getWelcomePlanSavings(plan, months);
  if (!savings) return null;
  return `(-${savings.savingsPercent}%)`;
}

/** Цена за месяц + скидка в одной строке: `700 ₽/мес (-8%)`. */
export function formatWelcomePlanPricePerMonthLabel(
  plan: WelcomePricingPlan,
  months: WelcomePeriodMonths
): string {
  const price = formatWelcomePlanPricePerMonth(plan, months);
  const discount = formatWelcomePlanDiscountSuffix(plan, months);
  return discount ? `${price} ${discount}` : price;
}

export function formatWelcomePeriodLabel(months: WelcomePeriodMonths): string {
  if (months === 1) return '1 месяц';
  if (months === 3) return '3 месяца';
  if (months === 6) return '6 месяцев';
  return '12 месяцев';
}
