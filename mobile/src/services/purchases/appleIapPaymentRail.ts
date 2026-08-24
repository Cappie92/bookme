import { isAppleIapPaidPlanName } from './appleProductMap';

/** iOS paid Apple IAP plan → use the direct StoreKit 2 purchase path. */
export function shouldUseAppleIapPurchase(platform: string, planName: string): boolean {
  return platform === 'ios' && isAppleIapPaidPlanName(planName);
}

/**
 * Paid Apple IAP plan with zero/promo final price must not go through apply-free on iOS.
 */
export function shouldBlockZeroPricePaidPlan(
  platform: string,
  planName: string,
  finalPrice: number
): boolean {
  return (
    platform === 'ios' &&
    isAppleIapPaidPlanName(planName) &&
    Number(finalPrice) <= 0
  );
}

/** Bonus points UI / usage is disabled for App Store subscription purchases. */
export function isIosPointsDisabled(platform: string): boolean {
  return platform === 'ios';
}

/** Promo codes are not applied for App Store subscription purchases. */
export function isIosPromoDisabled(platform: string): boolean {
  return platform === 'ios';
}

export function shouldBlockApplePurchaseForActiveNonAppleSub(
  platform: string,
  current: {
    is_active?: boolean | null;
    billing_provider?: string | null;
    end_date?: string | null;
    status?: string | null;
  } | null,
  nowMs: number = Date.now(),
): { blocked: boolean; endDateLabel?: string } {
  if (platform !== 'ios' || !current) return { blocked: false };
  const provider = (current.billing_provider || 'robokassa').toLowerCase();
  if (provider === 'apple') return { blocked: false };
  const end = current.end_date ? Date.parse(current.end_date) : NaN;
  const activeFlag =
    current.is_active === true ||
    current.status === 'active' ||
    current.status === 'ACTIVE';
  if (!activeFlag) return { blocked: false };
  if (!Number.isFinite(end) || end <= nowMs) return { blocked: false };
  return { blocked: true, endDateLabel: new Date(end).toLocaleDateString('ru-RU') };
}
