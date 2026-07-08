import {
  isLocalhostPaymentUrl,
  sanitizePaymentRedirectUrl,
  shouldPaySubscriptionFromBalance,
} from '@src/utils/subscriptionPayment';

describe('shouldPaySubscriptionFromBalance', () => {
  it('returns true when backend sets can_pay_from_balance', () => {
    expect(
      shouldPaySubscriptionFromBalance({
        finalPrice: 3210,
        availableBalance: 4762,
        canPayFromBalance: true,
        upgradeType: 'immediate',
      })
    ).toBe(true);
  });

  it('returns false for after_expiry', () => {
    expect(
      shouldPaySubscriptionFromBalance({
        finalPrice: 100,
        availableBalance: 5000,
        canPayFromBalance: true,
        upgradeType: 'after_expiry',
      })
    ).toBe(false);
  });

  it('falls back to balance comparison', () => {
    expect(
      shouldPaySubscriptionFromBalance({
        finalPrice: 100,
        availableBalance: 99,
        upgradeType: 'immediate',
      })
    ).toBe(false);
  });
});

describe('sanitizePaymentRedirectUrl', () => {
  it('rewrites localhost success URL in production', () => {
    const out = sanitizePaymentRedirectUrl(
      'http://localhost:5173/payment/success?payment=abc123token',
      'https://dedato.ru',
      false
    );
    expect(out).toBe('https://dedato.ru/payment/success?payment=abc123token');
  });

  it('keeps localhost in dev', () => {
    const url = 'http://localhost:5173/payment/success?payment=abc123token';
    expect(sanitizePaymentRedirectUrl(url, 'https://dedato.ru', true)).toBe(url);
  });

  it('detects localhost hosts', () => {
    expect(isLocalhostPaymentUrl('http://localhost:5173/x')).toBe(true);
    expect(isLocalhostPaymentUrl('https://dedato.ru/payment/success')).toBe(false);
  });
});
