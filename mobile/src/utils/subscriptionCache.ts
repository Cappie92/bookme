import { logger } from '@src/utils/logger';

/**
 * Subscription-related cache keys and invalidation.
 * User-scoped keys: @master_features:{userId}, @subscription_plans:{userId}, @master_settings:{userId}.
 * Legacy (no suffix): @master_features, @subscription_plans, @master_settings.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FEATURES_PREFIX = '@master_features';
export const PLANS_PREFIX = '@subscription_plans';
export const SETTINGS_PREFIX = '@master_settings';

const PREFIXES = [FEATURES_PREFIX, PLANS_PREFIX, SETTINGS_PREFIX] as const;

function legacyKey(prefix: string): string {
  return prefix;
}

function userScopedKey(prefix: string, userId: number): string {
  return `${prefix}:${userId}`;
}

/**
 * Invalidate all subscription-related caches.
 * - On login/register: call with new user.id so we clear legacy + any old user-scoped keys.
 * - On logout: call with userId from user_data before clearing auth, then clearAuth.
 * - On cold start: call with user.id from getCurrentUser so we refetch fresh.
 * Removes both legacy keys and user-scoped keys for all three prefixes.
 */
export async function invalidateSubscriptionCaches(userId?: number | null): Promise<void> {
  const toRemove: string[] = [];
  for (const p of PREFIXES) {
    toRemove.push(legacyKey(p));
    if (typeof userId === 'number') {
      toRemove.push(userScopedKey(p, userId));
    }
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const seen = new Set(toRemove);
    for (const k of keys) {
      if (PREFIXES.some((p) => k === p || k.startsWith(p + ':')) && !seen.has(k)) {
        seen.add(k);
        toRemove.push(k);
      }
    }
    if (toRemove.length) {
      await AsyncStorage.multiRemove(toRemove);
      logger.debug('features', '[SUBSCRIPTION_CACHE] Invalidated', toRemove.length, 'keys', toRemove);
    }
  } catch (e) {
    logger.warn('[SUBSCRIPTION_CACHE] Invalidation failed', e);
  }
}
