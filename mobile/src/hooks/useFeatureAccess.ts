import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMasterFeatures, MasterFeatures } from '@src/services/api/master';
import { fetchAvailableSubscriptions, SubscriptionPlan, SubscriptionType } from '@src/services/api/subscriptions';
import { getCheapestPlanForFeature } from '@src/utils/featureAccess';
import { useAuth } from '@src/auth/AuthContext';
import { FEATURES_PREFIX, PLANS_PREFIX } from '@src/utils/subscriptionCache';

const CACHE_TTL = 15 * 60 * 1000; // 15 минут

interface CachedData<T> {
  data: T;
  timestamp: number;
}

interface FeatureAccessResult {
  allowed: boolean;
  reasonText: string;
  cheapestPlanName: string | null;
}

function isMasterRole(role: string | undefined): boolean {
  return role === 'master' || role === 'indie';
}

/**
 * Хук для проверки доступа к функции подписки.
 * User-scoped cache: @master_features:{userId}, @subscription_plans:{userId}.
 */
export function useFeatureAccess(featureKey: string): FeatureAccessResult {
  const { user, token } = useAuth();
  const [features, setFeatures] = useState<MasterFeatures | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  const loadFeatures = useCallback(
    async (forceRefresh = false) => {
      if (!token || !user || !isMasterRole(user.role)) return;
      const userId = user.id;
      const featuresCacheKey = `${FEATURES_PREFIX}:${userId}`;
      try {
        if (!forceRefresh) {
          const cached = await AsyncStorage.getItem(featuresCacheKey);
          if (cached) {
            const parsed: CachedData<MasterFeatures> = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < CACHE_TTL) {
              setFeatures(parsed.data);
              return;
            }
          }
        }
        const data = await getMasterFeatures();
        setFeatures(data);
        await AsyncStorage.setItem(
          featuresCacheKey,
          JSON.stringify({ data, timestamp: Date.now() })
        );
      } catch (err) {
        console.error('[FEATURE_ACCESS] Features load error', err);
        const cached = await AsyncStorage.getItem(featuresCacheKey);
        if (cached) {
          try {
            const parsed: CachedData<MasterFeatures> = JSON.parse(cached);
            setFeatures(parsed.data);
          } catch {
            /* ignore */
          }
        }
      }
    },
    [token, user]
  );

  const loadPlans = useCallback(
    async (forceRefresh = false) => {
      if (!token || !user || !isMasterRole(user.role)) return;
      const userId = user.id;
      const plansCacheKey = `${PLANS_PREFIX}:${userId}`;
      try {
        if (!forceRefresh) {
          const cached = await AsyncStorage.getItem(plansCacheKey);
          if (cached) {
            const parsed: CachedData<SubscriptionPlan[]> = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < CACHE_TTL) {
              setPlans(parsed.data);
              return;
            }
          }
        }
        const data = await fetchAvailableSubscriptions(SubscriptionType.MASTER);
        setPlans(data);
        await AsyncStorage.setItem(
          plansCacheKey,
          JSON.stringify({ data, timestamp: Date.now() })
        );
      } catch (err) {
        console.error('[FEATURE_ACCESS] Plans load error', err);
        const cached = await AsyncStorage.getItem(plansCacheKey);
        if (cached) {
          try {
            const parsed: CachedData<SubscriptionPlan[]> = JSON.parse(cached);
            setPlans(parsed.data);
          } catch {
            /* ignore */
          }
        }
      }
    },
    [token, user]
  );

  useEffect(() => {
    if (token && user && isMasterRole(user.role)) {
      loadFeatures();
      loadPlans();
    }
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active' && token && user && isMasterRole(user.role)) {
        loadFeatures(true);
        loadPlans(true);
      }
    });
    return () => sub.remove();
  }, [loadFeatures, loadPlans, token, user]);

  const allowed = features ? (features as Record<string, unknown>)[featureKey] === true : false;
  const cheapestPlanName = allowed ? null : getCheapestPlanForFeature(plans, featureKey);
  const reasonText = cheapestPlanName
    ? `Доступно начиная с тарифа ${cheapestPlanName}`
    : 'Доступно в подписке';

  return { allowed, reasonText, cheapestPlanName };
}
