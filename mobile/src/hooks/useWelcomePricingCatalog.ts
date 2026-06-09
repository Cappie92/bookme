import { useCallback, useEffect, useState } from 'react';
import {
  fetchPricingCatalog,
  SubscriptionType,
} from '@src/services/api/subscriptions';
import {
  WELCOME_PRICING_FALLBACK_PLANS,
  type WelcomePricingPlan,
} from '@src/data/welcomePricingData';
import { mapPricingCatalogToWelcomePlans } from '@src/utils/welcomePricingMapper';

export function useWelcomePricingCatalog(
  subscriptionType: SubscriptionType = SubscriptionType.MASTER
) {
  const [plans, setPlans] = useState<WelcomePricingPlan[]>(WELCOME_PRICING_FALLBACK_PLANS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const catalog = await fetchPricingCatalog(subscriptionType);
      const mapped = mapPricingCatalogToWelcomePlans(catalog);
      if (mapped.length === 0) {
        setPlans(WELCOME_PRICING_FALLBACK_PLANS);
        setFallbackUsed(true);
        setError(new Error('Empty pricing catalog'));
        return;
      }
      setPlans(mapped);
      setFallbackUsed(false);
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Failed to load pricing catalog');
      setError(err);
      setPlans(WELCOME_PRICING_FALLBACK_PLANS);
      setFallbackUsed(true);
    } finally {
      setLoading(false);
    }
  }, [subscriptionType]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    plans,
    loading,
    error,
    fallbackUsed,
    refetch,
  };
}
