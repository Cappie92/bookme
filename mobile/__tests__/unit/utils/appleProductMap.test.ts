import {
  APPLE_IAP_PRODUCT_MAP,
  getAppleProductId,
  isAppleIapPaidPlanName,
  listAppleIapProductIds,
  resolveAppleProduct,
} from '@src/services/purchases/appleProductMap';

describe('appleProductMap', () => {
  it('maps all 12 Apple IAP products', () => {
    const ids = listAppleIapProductIds();
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
  });

  it.each([
    ['Basic', 1, 'ru.dedato.subscription.basic.monthly'],
    ['Basic', 3, 'ru.dedato.subscription.basic.3months'],
    ['Basic', 6, 'ru.dedato.subscription.basic.6months'],
    ['Basic', 12, 'ru.dedato.subscription.basic.yearly'],
    ['Pro', 1, 'ru.dedato.subscription.standard.monthly'],
    ['Pro', 3, 'ru.dedato.subscription.standard.3months'],
    ['Pro', 6, 'ru.dedato.subscription.standard.6months'],
    ['Pro', 12, 'ru.dedato.subscription.standard.yearly'],
    ['Premium', 1, 'dedato_premium_monthly'],
    ['Premium', 3, 'ru.dedato.subscription.premium.3months'],
    ['Premium', 6, 'ru.dedato.subscription.premium.6months'],
    ['Premium', 12, 'ru.dedato.subscription.premium.yearly'],
  ] as const)('getAppleProductId(%s, %s) → %s', (plan, months, productId) => {
    expect(getAppleProductId(plan, months)).toBe(productId);
    expect(APPLE_IAP_PRODUCT_MAP[plan][months]).toBe(productId);
    expect(resolveAppleProduct(productId)).toEqual({ planName: plan, months });
  });

  it('recognizes paid plan names only', () => {
    expect(isAppleIapPaidPlanName('Basic')).toBe(true);
    expect(isAppleIapPaidPlanName('Pro')).toBe(true);
    expect(isAppleIapPaidPlanName('Premium')).toBe(true);
    expect(isAppleIapPaidPlanName('Free')).toBe(false);
    expect(isAppleIapPaidPlanName('AlwaysFree')).toBe(false);
  });

  it('returns null for unknown plan/product', () => {
    expect(getAppleProductId('Free', 1)).toBeNull();
    expect(resolveAppleProduct('unknown_product')).toBeNull();
  });
});
