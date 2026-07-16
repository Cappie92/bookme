import { getSubscriptionPaymentHistory } from '@src/services/api/payments';
import { apiClient } from '@src/services/api/client';

describe('getSubscriptionPaymentHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls GET /api/payments/subscription/history via authenticated apiClient', async () => {
    const mockResponse = [
      {
        payment_id: 5,
        public_id: 'pay-5',
        paid_at: '2026-07-12T10:00:00',
        plan_name: 'Premium',
        plan_display_name: 'Premium',
        duration_months: 3,
        amount_paid: 2729,
        points_used: 481,
        points_spent: 481,
        points_earned: 321,
        package_value: 3210,
        monthly_price: 1070,
        subscription_start_date: '2026-07-12T10:00:00',
        subscription_end_date: '2026-10-09T10:00:00',
        status: 'paid',
        subscription_apply_status: 'applied',
        is_successful_purchase: true,
      },
    ];
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await getSubscriptionPaymentHistory();

    expect(apiClient.get).toHaveBeenCalledWith('/api/payments/subscription/history');
    expect(result).toEqual(mockResponse);
    expect(result[0].amount_paid).toBe(2729);
    expect(result[0].package_value).toBe(3210);
    expect(result[0].monthly_price).toBe(1070);
    expect(result[0].points_spent).toBe(481);
    expect(result[0].points_earned).toBe(321);
  });

  it('returns empty array when response data is not an array', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: null });
    await expect(getSubscriptionPaymentHistory()).resolves.toEqual([]);
  });

  it('propagates API errors for retry handling', async () => {
    (apiClient.get as jest.Mock).mockRejectedValue(new Error('network'));
    await expect(getSubscriptionPaymentHistory()).rejects.toThrow('network');
  });
});
