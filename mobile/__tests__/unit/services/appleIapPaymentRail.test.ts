import {
  isIosPointsDisabled,
  isIosPromoDisabled,
  shouldBlockApplePurchaseForActiveNonAppleSub,
  shouldBlockZeroPricePaidPlan,
  shouldUseAppleIapPurchase,
} from '@src/services/purchases/appleIapPaymentRail';

describe('appleIapPaymentRail', () => {
  describe('shouldUseAppleIapPurchase', () => {
    it('is true only for iOS paid Apple plans', () => {
      expect(shouldUseAppleIapPurchase('ios', 'Basic')).toBe(true);
      expect(shouldUseAppleIapPurchase('ios', 'Pro')).toBe(true);
      expect(shouldUseAppleIapPurchase('ios', 'Premium')).toBe(true);
      expect(shouldUseAppleIapPurchase('ios', 'Free')).toBe(false);
      expect(shouldUseAppleIapPurchase('android', 'Basic')).toBe(false);
      expect(shouldUseAppleIapPurchase('web', 'Pro')).toBe(false);
    });
  });

  describe('shouldBlockZeroPricePaidPlan', () => {
    it('blocks zero-price paid plans on iOS', () => {
      expect(shouldBlockZeroPricePaidPlan('ios', 'Basic', 0)).toBe(true);
      expect(shouldBlockZeroPricePaidPlan('ios', 'Pro', -1)).toBe(true);
      expect(shouldBlockZeroPricePaidPlan('ios', 'Premium', 100)).toBe(false);
      expect(shouldBlockZeroPricePaidPlan('ios', 'Free', 0)).toBe(false);
      expect(shouldBlockZeroPricePaidPlan('android', 'Basic', 0)).toBe(false);
    });
  });

  describe('isIosPointsDisabled', () => {
    it('disables points only on iOS', () => {
      expect(isIosPointsDisabled('ios')).toBe(true);
      expect(isIosPointsDisabled('android')).toBe(false);
      expect(isIosPointsDisabled('web')).toBe(false);
    });
  });

  describe('isIosPromoDisabled', () => {
    it('disables promo only on iOS', () => {
      expect(isIosPromoDisabled('ios')).toBe(true);
      expect(isIosPromoDisabled('android')).toBe(false);
      expect(isIosPromoDisabled('web')).toBe(false);
    });
  });

  describe('shouldBlockApplePurchaseForActiveNonAppleSub', () => {
    const future = '2099-12-31T23:59:59.000Z';
    const past = '2020-01-01T00:00:00.000Z';
    const nowMs = Date.parse('2026-08-09T12:00:00.000Z');

    it('does not block non-iOS or empty current', () => {
      expect(
        shouldBlockApplePurchaseForActiveNonAppleSub('android', {
          is_active: true,
          billing_provider: 'robokassa',
          end_date: future,
          status: 'active',
        }, nowMs)
      ).toEqual({ blocked: false });
      expect(shouldBlockApplePurchaseForActiveNonAppleSub('ios', null, nowMs)).toEqual({
        blocked: false,
      });
    });

    it('does not block active Apple subscription', () => {
      expect(
        shouldBlockApplePurchaseForActiveNonAppleSub(
          'ios',
          { is_active: true, billing_provider: 'apple', end_date: future, status: 'active' },
          nowMs
        )
      ).toEqual({ blocked: false });
    });

    it('blocks active non-Apple with future end date', () => {
      const result = shouldBlockApplePurchaseForActiveNonAppleSub(
        'ios',
        { is_active: true, billing_provider: 'robokassa', end_date: future, status: 'active' },
        nowMs
      );
      expect(result.blocked).toBe(true);
      expect(typeof result.endDateLabel).toBe('string');
    });

    it('treats missing billing_provider as robokassa', () => {
      const result = shouldBlockApplePurchaseForActiveNonAppleSub(
        'ios',
        { status: 'active', end_date: future },
        nowMs
      );
      expect(result.blocked).toBe(true);
    });

    it('does not block expired or inactive non-Apple', () => {
      expect(
        shouldBlockApplePurchaseForActiveNonAppleSub(
          'ios',
          { is_active: true, billing_provider: 'robokassa', end_date: past, status: 'active' },
          nowMs
        )
      ).toEqual({ blocked: false });
      expect(
        shouldBlockApplePurchaseForActiveNonAppleSub(
          'ios',
          { is_active: false, billing_provider: 'robokassa', end_date: future, status: 'expired' },
          nowMs
        )
      ).toEqual({ blocked: false });
    });
  });
});
