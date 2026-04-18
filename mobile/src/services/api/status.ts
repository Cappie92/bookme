import { apiClient } from './client';

/**
 * Получить статус API (health check)
 * Публичный эндпоинт, не требует авторизации
 */
export async function fetchStatus() {
  const response = await apiClient.get('/health');
  return response.data;
}

