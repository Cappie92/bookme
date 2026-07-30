/**
 * Master delete account API helpers
 */
import { apiClient } from '@src/services/api/client';
import {
  requestMasterDeleteAccountCall,
  confirmMasterDeleteAccount,
} from '@src/services/api/profile';

jest.mock('@src/services/api/client', () => ({
  apiClient: {
    delete: jest.fn(),
    post: jest.fn(),
  },
}));

describe('master delete account API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requestMasterDeleteAccountCall calls DELETE /api/auth/delete-account', async () => {
    (apiClient.delete as jest.Mock).mockResolvedValue({
      data: { message: 'ok', success: true },
    });
    const res = await requestMasterDeleteAccountCall();
    expect(apiClient.delete).toHaveBeenCalledWith('/api/auth/delete-account');
    expect(res.success).toBe(true);
  });

  it('confirmMasterDeleteAccount posts code', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      data: { message: 'Аккаунт успешно удален', success: true },
    });
    const res = await confirmMasterDeleteAccount('1234');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/auth/confirm-delete-account?code=1234'
    );
    expect(res.message).toContain('удален');
  });
});
