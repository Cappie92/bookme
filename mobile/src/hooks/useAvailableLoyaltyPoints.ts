import { useState, useEffect, useCallback } from 'react';
import {
  getAvailablePoints,
  AvailableLoyaltyPointsOut,
} from '@src/services/api/loyalty';

interface UseAvailableLoyaltyPointsResult {
  data: AvailableLoyaltyPointsOut | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Хук для загрузки доступных баллов для конкретного мастера
 * Используется при бронировании для показа чекбокса "Потратить баллы"
 * 
 * @param masterId - ID мастера (если null, данные не загружаются)
 * @returns { data, loading, error, refresh }
 * 
 * Особенности:
 * - Нет кеширования (данные должны быть свежими при бронировании)
 * - Автоматическая загрузка при изменении masterId
 */
export function useAvailableLoyaltyPoints(
  masterId: number | null
): UseAvailableLoyaltyPointsResult {
  const [data, setData] = useState<AvailableLoyaltyPointsOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!masterId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const freshData = await getAvailablePoints(masterId);
      setData(freshData);
    } catch (err: any) {
      const errorMessage = err.message || 'Ошибка загрузки доступных баллов';
      setError(errorMessage);
      setData(null);
      
      if (__DEV__) {
        console.error('[AVAILABLE LOYALTY POINTS ERROR]', errorMessage, err);
      }
    } finally {
      setLoading(false);
    }
  }, [masterId]);

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    data,
    loading,
    error,
    refresh,
  };
}
