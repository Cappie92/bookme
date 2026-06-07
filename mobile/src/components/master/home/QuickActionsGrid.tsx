import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@src/auth/AuthContext';
import { useMasterFeatures } from '@src/hooks/useMasterFeatures';
import {
  fetchAvailableSubscriptions,
  SubscriptionPlan,
  SubscriptionType,
} from '@src/services/api/subscriptions';
import { getCheapestPlanForFeature } from '@src/utils/featureAccess';
import { PLANS_PREFIX } from '@src/utils/subscriptionCache';
import { logger } from '@src/utils/logger';
import {
  MASTER_QUICK_ACTIONS,
  isMasterQuickActionDisabled,
  type MasterQuickActionItem,
} from './masterQuickActions';

const CACHE_TTL = 15 * 60 * 1000;

interface CachedData<T> {
  data: T;
  timestamp: number;
}

export function QuickActionsGrid() {
  const { user } = useAuth();
  const { features, loading } = useMasterFeatures();
  const [plans, setPlans] = React.useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = React.useState(false);
  const userId = user?.id ?? null;

  React.useEffect(() => {
    if (userId == null) return;
    const role = (user as { role?: string })?.role;
    if (role !== 'master' && role !== 'MASTER' && role !== 'indie') return;

    let cancelled = false;
    const loadPlans = async () => {
      const plansKey = `${PLANS_PREFIX}:${userId}`;
      try {
        setPlansLoading(true);
        const cached = await AsyncStorage.getItem(plansKey);
        if (cached) {
          const parsed: CachedData<SubscriptionPlan[]> = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < CACHE_TTL) {
            if (!cancelled) setPlans(parsed.data);
            return;
          }
        }
        const data = await fetchAvailableSubscriptions(SubscriptionType.MASTER);
        if (!cancelled) setPlans(data);
        await AsyncStorage.setItem(plansKey, JSON.stringify({ data, timestamp: Date.now() }));
      } catch (e) {
        logger.warn('quickActions', 'Failed to load subscription plans:', e);
      } finally {
        if (!cancelled) setPlansLoading(false);
      }
    };

    if (!loading && features) {
      void loadPlans();
    }

    return () => {
      cancelled = true;
    };
  }, [userId, user, loading, features]);

  const handlePress = (item: MasterQuickActionItem) => {
    const disabledByFeature = isMasterQuickActionDisabled(item, features, loading);
    const hasFeature = !!item.feature;
    const isLoadingAccessState = hasFeature && (loading || !features);
    const isDenied = hasFeature && !isLoadingAccessState && disabledByFeature;

    if (isLoadingAccessState) return;
    if (isDenied) {
      router.push('/subscriptions');
      return;
    }
    router.push(item.route as any);
  };

  return (
    <View style={styles.grid}>
      {MASTER_QUICK_ACTIONS.map((item) => {
        const disabledByFeature = isMasterQuickActionDisabled(item, features, loading);
        const hasFeature = !!item.feature;
        const isLoadingAccessState = hasFeature && (loading || !features);
        const isDenied = hasFeature && !isLoadingAccessState && disabledByFeature;
        const visuallyDisabled = isLoadingAccessState || isDenied;

        const showChip = isDenied && !plansLoading && plans.length > 0;
        const cheapestPlanName =
          showChip && item.feature ? getCheapestPlanForFeature(plans, item.feature) : null;

        return (
          <TouchableOpacity
            key={item.id}
            style={[styles.tile, visuallyDisabled && styles.tileDisabled]}
            activeOpacity={isLoadingAccessState ? 1 : 0.7}
            onPress={() => handlePress(item)}
            disabled={isLoadingAccessState}
          >
            <View style={styles.iconWrap}>
              <Ionicons
                name={item.icon}
                size={22}
                color={visuallyDisabled ? '#bbb' : '#4CAF50'}
              />
              {isDenied ? (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={10} color="#888" />
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, visuallyDisabled && styles.labelDisabled]} numberOfLines={2}>
              {item.label}
            </Text>
            {showChip && cheapestPlanName ? (
              <View style={styles.chip} pointerEvents="none">
                <Text style={styles.chipText} numberOfLines={1}>
                  Тариф
                </Text>
              </View>
            ) : null}
            {plansLoading && isDenied && !cheapestPlanName ? (
              <ActivityIndicator size="small" color="#999" style={styles.chipLoader} />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: 12,
  },
  tile: {
    width: '33.333%',
    paddingHorizontal: 4,
    paddingVertical: 4,
    minHeight: 96,
  },
  tileDisabled: {
    opacity: 0.85,
  },
  iconWrap: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    position: 'relative',
  },
  lockBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    lineHeight: 16,
  },
  labelDisabled: {
    color: '#999',
  },
  chip: {
    marginTop: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  chipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#E65100',
  },
  chipLoader: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
});
