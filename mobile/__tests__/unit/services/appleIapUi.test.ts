import {
  getAppleIapErrorPresentation,
  getSubscriptionPeriodLabel,
} from '@src/services/purchases/appleIapUi';

describe('Apple IAP UI semantics', () => {
  it.each([
    [1, '1 месяц'],
    [3, '3 месяца'],
    [6, '6 месяцев'],
    [12, '1 год'],
  ])('formats the canonical %s-month period', (months, label) => {
    expect(getSubscriptionPeriodLabel(months)).toBe(label);
  });

  it('explains retry semantics after backend unavailability without promising another charge', () => {
    const result = getAppleIapErrorPresentation({
      response: { status: 503, data: { detail: 'apple_status_api_unavailable' } },
    });
    expect(result.retryPending).toBe(true);
    expect(result.title).toBe('Проверка покупки отложена');
    expect(result.message).toContain('повторное списание не требуется');
    expect(result.message).toContain('проверена снова автоматически');
  });

  it('uses a wrong-account message for appAccountToken mismatch', () => {
    const result = getAppleIapErrorPresentation({
      response: {
        status: 403,
        data: { detail: 'Apple app account token does not match the authenticated user' },
      },
    });
    expect(result.retryPending).toBe(false);
    expect(result.title).toBe('Проверьте аккаунт DeDato');
    expect(result.message).toContain('нужный аккаунт DeDato');
  });

  it('distinguishes an unverified StoreKit transaction from a network retry', () => {
    const result = getAppleIapErrorPresentation({ code: 'storekit_unverified_transaction' });
    expect(result.retryPending).toBe(false);
    expect(result.title).toBe('Покупка не подтверждена');
  });

  it('explains a cross-provider conflict without exposing backend details', () => {
    const result = getAppleIapErrorPresentation({
      response: { status: 409, data: { detail: 'blocked_by_active_non_apple_subscription' } },
    });
    expect(result.title).toBe('Подписка уже активна');
    expect(result.message).toContain('другой способ оплаты');
  });
});
