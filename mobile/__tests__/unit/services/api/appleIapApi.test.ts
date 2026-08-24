import {
  fetchAppleBillingIdentity,
  fetchApplePurchaseEligibility,
  refreshAppleSubscriptions,
  verifyAppleTransaction,
} from '@src/services/api/payments';
import { apiClient } from '@src/services/api/client';

describe('direct Apple IAP API client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads the backend-issued appAccountToken', async () => {
    const data = { app_account_token: '8d84e539-8f28-4b61-9073-d8e38eabbad8' };
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data });
    await expect(fetchAppleBillingIdentity()).resolves.toEqual(data);
    expect(apiClient.get).toHaveBeenCalledWith('/api/payments/apple/billing-identity');
  });

  it('checks purchase eligibility', async () => {
    const data = { allowed: false, reason: 'blocked_by_active_non_apple_subscription' };
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data });
    await expect(fetchApplePurchaseEligibility()).resolves.toEqual(data);
    expect(apiClient.get).toHaveBeenCalledWith('/api/payments/apple/purchase-eligibility');
  });

  it('posts signed transaction and source', async () => {
    const data = {
      verified: true,
      recorded: true,
      finish_transaction: true,
      source: 'purchase' as const,
    };
    (apiClient.post as jest.Mock).mockResolvedValueOnce({ data });
    await expect(
      verifyAppleTransaction({ signed_transaction: 'signed-jws', source: 'purchase' })
    ).resolves.toEqual(data);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/payments/apple/transactions/verify',
      { signed_transaction: 'signed-jws', source: 'purchase' }
    );
  });

  it('refreshes authoritative Apple subscription lifecycle', async () => {
    const data = { verified: true, recorded: true, refreshed: 1, subscriptions: [] };
    (apiClient.post as jest.Mock).mockResolvedValueOnce({ data });
    await expect(refreshAppleSubscriptions()).resolves.toEqual(data);
    expect(apiClient.post).toHaveBeenCalledWith('/api/payments/apple/subscriptions/refresh');
  });
});
