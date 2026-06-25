import { SubscriptionPlan } from '@src/services/api/subscriptions';

export type SubscriptionDurationMonths = 1 | 3 | 6 | 12;

export interface PeriodSavings {
  baselineRub: number;
  savingsRub: number;
  savingsPercent: number;
}

export function getPeriodTotalPrice(
  plan: SubscriptionPlan,
  months: SubscriptionDurationMonths
): number {
  if (months === 1) return plan.price_1month;
  const monthlyPrice =
    months === 3 ? plan.price_3months : months === 6 ? plan.price_6months : plan.price_12months;
  return monthlyPrice * months;
}

/**
 * Сравнивает цену периода с помесячной оплатой (price_1month × months).
 */
export function computePeriodSavings(
  price1Month: number,
  months: number,
  totalPrice: number
): PeriodSavings | null {
  if (months <= 1 || price1Month <= 0 || totalPrice <= 0) return null;
  const baselineRub = Math.round(price1Month * months);
  const savingsRub = baselineRub - Math.round(totalPrice);
  if (savingsRub <= 0) return null;
  const savingsPercent = Math.round((savingsRub / baselineRub) * 100);
  return { baselineRub, savingsRub, savingsPercent };
}

export function getPlanPeriodSavings(
  plan: SubscriptionPlan,
  months: SubscriptionDurationMonths
): PeriodSavings | null {
  const totalPrice = getPeriodTotalPrice(plan, months);
  return computePeriodSavings(plan.price_1month, months, totalPrice);
}
