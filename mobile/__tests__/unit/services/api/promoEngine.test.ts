import {
  applyMasterPromoCode,
  getCurrentMasterPromoCode,
  getMasterReferralCode,
  getSubscriptionPoints,
} from '@src/services/api/promoEngine';
import { apiClient } from '@src/services/api/client';

describe('Promo Engine API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch master referral code', async () => {
    const mockResponse = { code: 'MTEST123' };
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await getMasterReferralCode();

    expect(apiClient.get).toHaveBeenCalledWith('/api/master/referral-code');
    expect(result).toEqual(mockResponse);
  });

  it('should apply master promo code', async () => {
    const mockResponse = { success: true, code: 'REF123' };
    (apiClient.post as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await applyMasterPromoCode('REF123');

    expect(apiClient.post).toHaveBeenCalledWith('/api/master/promo-code/apply', { code: 'REF123' });
    expect(result).toEqual(mockResponse);
  });

  it('should fetch current master promo code', async () => {
    const mockResponse = { code: 'REF123', status: 'pending' };
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await getCurrentMasterPromoCode();

    expect(apiClient.get).toHaveBeenCalledWith('/api/master/promo-code/current');
    expect(result).toEqual(mockResponse);
  });

  it('should fetch subscription points', async () => {
    const mockResponse = { balance: 1000, items: [] };
    (apiClient.get as jest.Mock).mockResolvedValue({ data: mockResponse });

    const result = await getSubscriptionPoints();

    expect(apiClient.get).toHaveBeenCalledWith('/api/master/subscription-points');
    expect(result).toEqual(mockResponse);
  });
});
