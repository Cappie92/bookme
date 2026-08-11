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
    ['Basic', 1, 'dedato_basic_1m'],
    ['Basic', 3, 'dedato_basic_3m'],
    ['Basic', 6, 'dedato_basic_6m'],
    ['Basic', 12, 'dedato_basic_12m'],
    ['Pro', 1, 'dedato_pro_1m'],
    ['Pro', 3, 'dedato_pro_3m'],
    ['Pro', 6, 'dedato_pro_6m'],
    ['Pro', 12, 'dedato_pro_12m'],
    ['Premium', 1, 'dedato_premium_1m'],
    ['Premium', 3, 'dedato_premium_3m'],
    ['Premium', 6, 'dedato_premium_6m'],
    ['Premium', 12, 'dedato_premium_12m'],
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
