/**
 * Canonical Apple IAP product IDs for DeDato subscriptions.
 * Keep in sync with backend/utils/apple_iap_products.py
 *
 * Paid plans only: Basic / Pro / Premium × 1/3/6/12 months.
 * Free is not an Apple product.
 */

/** @type {ReadonlyArray<1|3|6|12>} */
export const APPLE_IAP_DURATIONS = Object.freeze([1, 3, 6, 12]);

/** @type {ReadonlyArray<'Basic'|'Pro'|'Premium'>} */
export const APPLE_IAP_PAID_PLAN_NAMES = Object.freeze(['Basic', 'Pro', 'Premium']);

export const APPLE_IAP_EXTERNAL_TIER_BY_PLAN = Object.freeze({
  Basic: 'Basic',
  Pro: 'Standard',
  Premium: 'Premium',
});

/**
 * (planName, months) → App Store product_id
 * @type {Readonly<Record<string, Readonly<Record<number, string>>>>}
 */
export const APPLE_IAP_PRODUCT_MAP = Object.freeze({
  Basic: Object.freeze({
    1: 'ru.dedato.subscription.basic.monthly',
    3: 'ru.dedato.subscription.basic.3months',
    6: 'ru.dedato.subscription.basic.6months',
    12: 'ru.dedato.subscription.basic.yearly',
  }),
  Pro: Object.freeze({
    1: 'ru.dedato.subscription.standard.monthly',
    3: 'ru.dedato.subscription.standard.3months',
    6: 'ru.dedato.subscription.standard.6months',
    12: 'ru.dedato.subscription.standard.yearly',
  }),
  Premium: Object.freeze({
    1: 'dedato_premium_monthly',
    3: 'ru.dedato.subscription.premium.3months',
    6: 'ru.dedato.subscription.premium.6months',
    12: 'ru.dedato.subscription.premium.yearly',
  }),
});

/** @returns {string[]} */
export function listAppleIapProductIds() {
  const ids = [];
  for (const plan of APPLE_IAP_PAID_PLAN_NAMES) {
    for (const months of APPLE_IAP_DURATIONS) {
      ids.push(APPLE_IAP_PRODUCT_MAP[plan][months]);
    }
  }
  return ids;
}

/**
 * @param {string} planName
 * @param {number} months
 * @returns {string|null}
 */
export function getAppleProductId(planName, months) {
  const byPlan = APPLE_IAP_PRODUCT_MAP[planName];
  if (!byPlan) return null;
  const id = byPlan[months];
  return typeof id === 'string' ? id : null;
}

/**
 * @param {string} productId
 * @returns {{ planName: string, months: number }|null}
 */
export function resolveAppleProduct(productId) {
  if (!productId || typeof productId !== 'string') return null;
  for (const plan of APPLE_IAP_PAID_PLAN_NAMES) {
    for (const months of APPLE_IAP_DURATIONS) {
      if (APPLE_IAP_PRODUCT_MAP[plan][months] === productId) {
        return { planName: plan, months };
      }
    }
  }
  return null;
}

export function resolveAppleProductDetails(productId) {
  const resolved = resolveAppleProduct(productId);
  if (!resolved) return null;
  return {
    productId,
    durationMonths: resolved.months,
    internalPlanName: resolved.planName,
    externalTier: APPLE_IAP_EXTERNAL_TIER_BY_PLAN[resolved.planName],
  };
}

export function isAppleIapPaidPlanName(planName) {
  return APPLE_IAP_PAID_PLAN_NAMES.includes(planName);
}
