import {
  getClientProfile,
  updateClientProfile,
  changePassword,
  deleteAccount,
} from '@src/services/api/profile';
import { apiClient } from "@src/services/api/client";

describe('Profile API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getClientProfile', () => {
    it('should get client profile', async () => {
      const mockProfile = {
        id: 1,
        name: 'Test User',
        email: 'test@test.com',
        phone: '+79999999999',
        birth_date: null,
        created_at: '2025-01-01T00:00:00Z',
      };
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockProfile });

      const result = await getClientProfile();

      expect(apiClient.get).toHaveBeenCalledWith('/api/client/profile');
      expect(result).toEqual(mockProfile);
    });
  });

  describe('updateClientProfile', () => {
    it('should update client profile with email', async () => {
      const updateData = {
        email: 'new@test.com',
      };
      const mockResponse = {
        message: 'Profile updated successfully',
      };
      (apiClient.put as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await updateClientProfile(updateData);

      expect(apiClient.put).toHaveBeenCalledWith('/api/client/profile', updateData);
      expect(result).toEqual(mockResponse);
    });

    it('should update client profile with phone', async () => {
      const updateData = {
        phone: '+78888888888',
      };
      const mockResponse = {
        message: 'Profile updated successfully',
      };
      (apiClient.put as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await updateClientProfile(updateData);

      expect(apiClient.put).toHaveBeenCalledWith('/api/client/profile', updateData);
      expect(result).toEqual(mockResponse);
    });

    it('should update client profile with both email and phone', async () => {
      const updateData = {
        email: 'new@test.com',
        phone: '+78888888888',
      };
      const mockResponse = {
        message: 'Profile updated successfully',
      };
      (apiClient.put as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await updateClientProfile(updateData);

      expect(apiClient.put).toHaveBeenCalledWith('/api/client/profile', updateData);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('changePassword', () => {
    it('should change password', async () => {
      const passwordData = {
        current_password: 'oldpassword',
        new_password: 'newpassword',
      };
      const mockResponse = {
        message: 'Password changed successfully',
      };
      (apiClient.put as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await changePassword(passwordData);

      expect(apiClient.put).toHaveBeenCalledWith('/api/client/change-password', passwordData);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteAccount', () => {
    it('should delete account', async () => {
      const deleteData = {
        password: 'password123',
      };
      const mockResponse = {
        message: 'Account deleted successfully',
      };
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: mockResponse });

      const result = await deleteAccount(deleteData);

      expect(apiClient.delete).toHaveBeenCalledWith('/api/client/account', {
        data: deleteData,
      });
      expect(result).toEqual(mockResponse);
    });
  });
});

