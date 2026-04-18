import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMasterFeatures, MasterFeatures } from '@src/services/api/master';
import { useAuth } from '@src/auth/AuthContext';
import { FEATURES_PREFIX } from '@src/utils/subscriptionCache';
import { logger } from '@src/utils/logger';

const CACHE_TTL = 15 * 60 * 1000; // 15 минут

type FeaturesSource = 'cache' | 'network' | 'fallback' | null;

interface CachedData<T> {
  data: T;
  timestamp: number;
}

function isMasterRole(role: string | undefined): boolean {
  return role === 'master' || role === 'indie';
}

/**
 * Хук для получения всех features мастера одним вызовом.
 * User-scoped cache: @master_features:{userId}.
 */
export function useMasterFeatures() {
  const { user, token } = useAuth();
  /** Стабильные примитивы — иначе новый объект `user` с контекста пересоздаёт loadFeatures и ломает useEffect / useFocusEffect deps */
  const userId = user?.id;
  const userRole = user?.role;

  const [features, setFeatures] = useState<MasterFeatures | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<FeaturesSource>(null);
  const inFlightRef = (globalThis as { __masterFeaturesInFlightRef?: { p: Promise<MasterFeatures> | null } })
    .__masterFeaturesInFlightRef ??= { p: null };

  const loadFeatures = useCallback(
    async (forceRefresh = false) => {
      if (!token || userId == null || !isMasterRole(userRole)) {
        logger.debug('features', '[FEATURES] Skip load', { hasToken: !!token, hasUserId: userId != null, role: userRole });
        setFeatures(null);
        setLoading(false);
        setSource(null);
        return;
      }
      const featuresCacheKey = `${FEATURES_PREFIX}:${userId}`;

      try {
        if (!forceRefresh) {
          const cached = await AsyncStorage.getItem(featuresCacheKey);
          if (cached) {
            const parsed: CachedData<MasterFeatures> = JSON.parse(cached);
            const age = Date.now() - parsed.timestamp;
            if (age < CACHE_TTL) {
              setFeatures(parsed.data);
              setSource('cache');
              setLoading(false);
              logger.debug('features', '🧩 [FEATURES]', {
                source: 'cache',
                userId,
                plan_name: (parsed.data as { plan_name?: string })?.plan_name,
                has_extended_stats: (parsed.data as { has_extended_stats?: boolean })?.has_extended_stats,
              });
              return;
            }
          }
        }

        const p = !forceRefresh && inFlightRef.p ? inFlightRef.p : getMasterFeatures();
        if (!forceRefresh) inFlightRef.p = p;
        const data = await p;
        if (inFlightRef.p === p) inFlightRef.p = null;

        setFeatures(data);
        setSource('network');
        await AsyncStorage.setItem(
          featuresCacheKey,
          JSON.stringify({ data, timestamp: Date.now() })
        );
        logger.debug('features', '🧩 [FEATURES]', {
          source: 'network',
          userId,
          plan_name: (data as { plan_name?: string })?.plan_name,
          has_extended_stats: (data as { has_extended_stats?: boolean })?.has_extended_stats,
        });
      } catch (err) {
        logger.error('[FEATURES] Load error', err);
        inFlightRef.p = null;
        const cached = await AsyncStorage.getItem(featuresCacheKey);
        if (cached) {
          try {
            const parsed: CachedData<MasterFeatures> = JSON.parse(cached);
            setFeatures(parsed.data);
            setSource('fallback');
            logger.debug('features', '🧩 [FEATURES]', {
              source: 'fallback',
              userId,
              plan_name: (parsed.data as { plan_name?: string })?.plan_name,
              has_extended_stats: (parsed.data as { has_extended_stats?: boolean })?.has_extended_stats,
            });
          } catch {
            /* ignore */
          }
        } else {
          setFeatures(null);
          setSource(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [token, userId, userRole]
  );

  /** Обязательно стабильная ссылка: иначе useFocusEffect([refresh]) на экранах вроде Статистики уходит в цикл refetch при каждом рендере */
  const refresh = useCallback(() => {
    void loadFeatures(true);
  }, [loadFeatures]);

  useEffect(() => {
    if (token && userId != null && isMasterRole(userRole)) {
      loadFeatures();
    } else {
      setFeatures(null);
      setLoading(false);
      setSource(null);
    }
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && token && userId != null && isMasterRole(userRole)) {
        void loadFeatures(true);
      }
    });
    return () => sub.remove();
  }, [loadFeatures, token, userId, userRole]);

  return {
    features,
    loading,
    source,
    refresh,
  };
}
