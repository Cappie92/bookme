import {
  getAllFavorites,
  addToFavorites,
  removeFromFavorites,
  getFavoriteName,
  getFavoriteItemId,
  Favorite,
} from '@src/services/api/favorites';
import { apiClient } from "@src/services/api/client";
import { mockFavorites } from '../../../../test-utils/helpers/test-data';

describe('Favorites API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllFavorites', () => {
    it('should combine salons, masters, services (master-only, no indie-masters)', async () => {
      (apiClient.get as jest.Mock)
        .mockResolvedValueOnce({ data: [{ salon_id: 1, favorite_name: 'Salon', created_at: '2025-01-01T00:00:00Z' }] })
        .mockResolvedValueOnce({ data: [{ master_id: 1, favorite_name: 'Master', created_at: '2025-01-02T00:00:00Z' }] })
        .mockResolvedValueOnce({ data: [] });

      const result = await getAllFavorites();

      expect(result.length).toBe(2);
      expect(apiClient.get).toHaveBeenCalledTimes(3);
      expect(apiClient.get).toHaveBeenCalledWith('/api/client/favorites/salons');
      expect(apiClient.get).toHaveBeenCalledWith('/api/client/favorites/masters');
      expect(apiClient.get).toHaveBeenCalledWith('/api/client/favorites/services');
    });

    it('should handle errors gracefully', async () => {
      (apiClient.get as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      const result = await getAllFavorites();

      expect(result.length).toBe(0);
    });

    it('should sort favorites by created_at (newest first)', async () => {
      const oldFavorite = { salon_id: 1, favorite_name: 'Old', created_at: '2025-01-01T00:00:00Z' };
      const newFavorite = { salon_id: 2, favorite_name: 'New', created_at: '2025-01-02T00:00:00Z' };
      (apiClient.get as jest.Mock)
        .mockResolvedValueOnce({ data: [oldFavorite, newFavorite] })
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      const result = await getAllFavorites();

      expect(result[0].favorite_name).toBe('New');
      expect(result[1].favorite_name).toBe('Old');
    });
  });

  describe('addToFavorites', () => {
    it('should add master to favorites', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: { id: 1 } });

      await addToFavorites('master', 1, 'Test Master');

      expect(apiClient.post).toHaveBeenCalledWith('/api/client/favorites', {
        favorite_type: 'master',
        master_id: 1,
        favorite_name: 'Test Master',
      });
    });

    it('should add salon to favorites', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: { id: 1 } });

      await addToFavorites('salon', 1, 'Test Salon');

      expect(apiClient.post).toHaveBeenCalledWith('/api/client/favorites', {
        favorite_type: 'salon',
        salon_id: 1,
        favorite_name: 'Test Salon',
      });
    });

    it('should add service to favorites', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: { id: 1 } });

      await addToFavorites('service', 1, 'Test Service');

      expect(apiClient.post).toHaveBeenCalledWith('/api/client/favorites', {
        favorite_type: 'service',
        service_id: 1,
        favorite_name: 'Test Service',
      });
    });

    it('should use default name if not provided', async () => {
      (apiClient.post as jest.Mock).mockResolvedValue({ data: { id: 1 } });

      await addToFavorites('master', 1);

      expect(apiClient.post).toHaveBeenCalledWith('/api/client/favorites', {
        favorite_type: 'master',
        master_id: 1,
        favorite_name: 'Избранное',
      });
    });
  });

  describe('removeFromFavorites', () => {
    it('should remove master from favorites', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: {} });

      await removeFromFavorites('master', 1);

      expect(apiClient.delete).toHaveBeenCalledWith('/api/client/favorites/master/1');
    });

    it('should remove salon from favorites', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: {} });

      await removeFromFavorites('salon', 1);

      expect(apiClient.delete).toHaveBeenCalledWith('/api/client/favorites/salon/1');
    });

    it('should remove service from favorites', async () => {
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: {} });

      await removeFromFavorites('service', 1);

      expect(apiClient.delete).toHaveBeenCalledWith('/api/client/favorites/service/1');
    });
  });

  describe('getFavoriteName', () => {
    it('should return salon name', () => {
      const favorite: Favorite = {
        id: 1,
        type: 'salon',
        salon_id: 1,
        favorite_name: 'Test Salon',
        salon: {
          id: 1,
          name: 'Salon Name',
        },
      };

      expect(getFavoriteName(favorite)).toBe('Salon Name');
    });

    it('should return master name', () => {
      const favorite: Favorite = {
        id: 1,
        type: 'master',
        master_id: 1,
        favorite_name: 'Test Master',
        master: {
          id: 1,
          user: {
            full_name: 'Master Name',
          },
        },
      };

      expect(getFavoriteName(favorite)).toBe('Master Name');
    });

    it('should return favorite_name as fallback', () => {
      const favorite: Favorite = {
        id: 1,
        type: 'salon',
        salon_id: 1,
        favorite_name: 'Test Salon',
      };

      expect(getFavoriteName(favorite)).toBe('Test Salon');
    });
  });

  describe('getFavoriteItemId', () => {
    it('should return salon_id for salon', () => {
      const favorite: Favorite = {
        id: 1,
        type: 'salon',
        salon_id: 1,
        favorite_name: 'Test Salon',
      };

      expect(getFavoriteItemId(favorite)).toBe(1);
    });

    it('should return master_id for master', () => {
      const favorite: Favorite = {
        id: 1,
        type: 'master',
        master_id: 2,
        favorite_name: 'Test Master',
      };

      expect(getFavoriteItemId(favorite)).toBe(2);
    });

    it('should return null if id not found', () => {
      const favorite: Favorite = {
        id: 1,
        type: 'salon',
        favorite_name: 'Test Salon',
      };

      expect(getFavoriteItemId(favorite)).toBeNull();
    });
  });
});

