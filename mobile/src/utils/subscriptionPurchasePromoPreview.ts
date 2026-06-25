import type { SubscriptionCalculationResponse } from '@src/services/api/subscriptions';
import { getPromoPreviewDisplay } from '@src/utils/promoEngine';

export function getPeriodStepSubscriptionPurchasePromoPreviewDisplay(
  calculation: SubscriptionCalculationResponse | null
) {
  return getPromoPreviewDisplay(calculation?.promo_preview);
}

export function getPeriodStepSubscriptionPurchasePriceSnapshot(
  calculation: SubscriptionCalculationResponse | null
) {
  if (!calculation) return null;
  return {
    finalPrice: calculation.final_price,
    totalPrice: calculation.total_price,
    savingsPercent: calculation.savings_percent,
  };
}
