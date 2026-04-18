import { apiClient } from './client';

/** Master-only: salon, master, service (indie_master убран) */
export type FavoriteType = 'salon' | 'master' | 'service';

export interface Favorite {
  id: number;
  client_favorite_id?: number;
  type: FavoriteType;
  favorite_name: string;
  salon_id?: number;
  master_id?: number;
  service_id?: number;
  salon?: {
    id: number;
    name: string;
    city?: string;
    description?: string;
  };
  master?: {
    id: number;
    user?: {
      full_name: string;
    };
    city?: string;
    bio?: string;
    domain?: string;
  };
  service?: {
    id: number;
    name: string;
    price: number;
    duration: number;
    description?: string;
  };
  created_at?: string;
}

/**
 * Получить избранных мастеров (master-only).
 */
export async function getMastersFavorites(): Promise<Favorite[]> {
  try {
    const response = await apiClient.get('/api/client/favorites/masters');
    const masters = Array.isArray(response.data) ? response.data : [];
    return masters.map((fav: any) => ({
      ...fav,
      type: 'master' as FavoriteType,
    }));
  } catch (error) {
    console.warn('Ошибка при загрузке избранных мастеров:', error);
    return [];
  }
}

/**
 * Получить все избранные (для FavoritesModal: masters + salons + services).
 * Master-only для мастеров: indie-masters не загружаются.
 */
export async function getAllFavorites(): Promise<Favorite[]> {
  const allFavorites: Favorite[] = [];

  try {
    const salonsResponse = await apiClient.get('/api/client/favorites/salons');
    if (salonsResponse.data) {
      const salons = Array.isArray(salonsResponse.data) ? salonsResponse.data : [];
      allFavorites.push(...salons.map((fav: any) => ({ ...fav, type: 'salon' as FavoriteType })));
    }
  } catch (error) {
    console.warn('Ошибка при загрузке избранных салонов:', error);
  }

  try {
    const mastersResponse = await apiClient.get('/api/client/favorites/masters');
    if (mastersResponse.data) {
      const masters = Array.isArray(mastersResponse.data) ? mastersResponse.data : [];
      allFavorites.push(...masters.map((fav: any) => ({ ...fav, type: 'master' as FavoriteType })));
    }
  } catch (error) {
    console.warn('Ошибка при загрузке избранных мастеров:', error);
  }

  try {
    const servicesResponse = await apiClient.get('/api/client/favorites/services');
    if (servicesResponse.data) {
      const services = Array.isArray(servicesResponse.data) ? servicesResponse.data : [];
      allFavorites.push(...services.map((fav: any) => ({ ...fav, type: 'service' as FavoriteType })));
    }
  } catch (error) {
    console.warn('Ошибка при загрузке избранных услуг:', error);
  }

  return allFavorites.sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateB - dateA;
  });
}

/**
 * Добавить в избранное. Master-only для мастеров.
 */
export async function addToFavorites(type: FavoriteType, itemId: number, itemName?: string): Promise<void> {
  const body: Record<string, unknown> = {
    favorite_type: type,
    favorite_name: itemName || 'Избранное',
  };
  if (type === 'salon') body.salon_id = itemId;
  else if (type === 'master') body.master_id = itemId;
  else if (type === 'service') body.service_id = itemId;

  await apiClient.post('/api/client/favorites', body);
}

/**
 * Удалить из избранного.
 */
export async function removeFromFavorites(type: FavoriteType, itemId: number): Promise<void> {
  await apiClient.delete(`/api/client/favorites/${type}/${itemId}`);
}

export function getFavoriteName(favorite: Favorite): string {
  if (favorite.type === 'salon' && favorite.salon) {
    return favorite.salon.name || favorite.favorite_name || 'Салон';
  }
  if (favorite.type === 'master' && favorite.master?.user) {
    return favorite.master.user.full_name || favorite.favorite_name || 'Мастер';
  }
  if (favorite.type === 'service' && favorite.service) {
    return favorite.service.name || favorite.favorite_name || 'Услуга';
  }
  return favorite.favorite_name || 'Избранное';
}

export function getFavoriteItemId(favorite: Favorite): number | null {
  if (favorite.type === 'salon' && favorite.salon_id) return favorite.salon_id;
  if (favorite.type === 'master' && favorite.master_id) return favorite.master_id;
  if (favorite.type === 'service' && favorite.service_id) return favorite.service_id;
  return null;
}
