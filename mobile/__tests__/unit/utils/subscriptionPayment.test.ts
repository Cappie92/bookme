import {
  isLocalhostPaymentUrl,
  resolveCardPortion,
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
      })
    ).toBe(true);
  });

  it('allows after_expiry when fully covered by balance (card_portion=0)', () => {
    expect(
      shouldPaySubscriptionFromBalance({
        finalPrice: 100,
        availableBalance: 5000,
        canPayFromBalance: true,
        cardPortion: 0,
        balancePortion: 100,
      })
    ).toBe(true);
  });

  it('returns false when card_portion > 0 even if balance helps', () => {
    expect(
      shouldPaySubscriptionFromBalance({
        finalPrice: 1000,
        availableBalance: 300,
        canPayFromBalance: false,
        cardPortion: 700,
        balancePortion: 300,
      })
    ).toBe(false);
  });

  it('falls back to balance comparison', () => {
    expect(
      shouldPaySubscriptionFromBalance({
        finalPrice: 100,
        availableBalance: 99,
      })
    ).toBe(false);
  });
});

describe('resolveCardPortion', () => {
  it('uses card_portion from backend', () => {
    expect(resolveCardPortion({ finalPrice: 1000, cardPortion: 600 })).toBe(600);
  });

  it('returns 0 when paying from balance', () => {
    expect(resolveCardPortion({ finalPrice: 1000, cardPortion: 600, payFromBalance: true })).toBe(0);
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
