import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getClientLoyaltyPoints,
  ClientLoyaltyPointsOut,
} from '@src/services/api/loyalty';

const LOYALTY_POINTS_CACHE_KEY = '@loyalty_points';
const CACHE_TTL = 30 * 1000; // 30 секунд (как требовалось)

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface UseLoyaltyPointsResult {
  data: ClientLoyaltyPointsOut[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Хук для загрузки и кеширования баллов лояльности клиента
 * 
 * @returns { data, loading, error, refresh }
 * 
 * Особенности:
 * - Кеширование с TTL 30 секунд
 * - Автообновление при фокусе приложения
 * - Обработка ошибок 403 (нет доступа) и network errors
 */
export function useLoyaltyPoints(): UseLoyaltyPointsResult {
  const [data, setData] = useState<ClientLoyaltyPointsOut[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      // Проверяем кеш
      if (!forceRefresh) {
        const cached = await AsyncStorage.getItem(LOYALTY_POINTS_CACHE_KEY);
        if (cached) {
          const parsed: CachedData<ClientLoyaltyPointsOut[]> = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          if (age < CACHE_TTL) {
            if (__DEV__) {
              console.log('[LOYALTY POINTS CACHE]', {
                source: 'cache',
                ageMs: age,
                mastersCount: parsed.data.length,
              });
            }
            setData(parsed.data);
            setLoading(false);
            setError(null);
            return;
          }
        }
      }

      // Загружаем свежие данные
      const freshData = await getClientLoyaltyPoints();
      setData(freshData);
      setError(null);
      
      // Сохраняем в кеш
      await AsyncStorage.setItem(
        LOYALTY_POINTS_CACHE_KEY,
        JSON.stringify({ data: freshData, timestamp: Date.now() })
      );
      
      if (__DEV__) {
        console.log('[LOYALTY POINTS CACHE]', {
          source: 'network',
          mastersCount: freshData.length,
        });
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Ошибка загрузки баллов';
      setError(errorMessage);
      
      // Пытаемся загрузить из кеша даже если он устарел
      const cached = await AsyncStorage.getItem(LOYALTY_POINTS_CACHE_KEY);
      if (cached) {
        try {
          const parsed: CachedData<ClientLoyaltyPointsOut[]> = JSON.parse(cached);
          setData(parsed.data);
          if (__DEV__) {
            console.log('[LOYALTY POINTS ERROR FALLBACK]', {
              usedFallback: true,
              errorMessage,
            });
          }
        } catch {
          // Игнорируем ошибки парсинга кеша
        }
      } else {
        setData(null);
      }
      
      if (__DEV__) {
        console.error('[LOYALTY POINTS ERROR]', errorMessage, err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await loadData(true);
  }, [loadData]);

  useEffect(() => {
    loadData();

    // Обновляем при фокусе приложения
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        loadData(true); // Принудительное обновление при возврате в приложение
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loadData]);

  return {
    data,
    loading,
    error,
    refresh,
  };
}
