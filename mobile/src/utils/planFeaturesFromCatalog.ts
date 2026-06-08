/**
 * Построение списка «Что входит» из pricing-catalog API.
 * Логика синхронизирована с shared/subscriptionPlanFeatures.js (getPlanFeatures).
 */

type PlanLike = {
  name: string;
  features?: Record<string, unknown> | null;
  limits?: Record<string, unknown> | null;
};

type ServiceFunctionLike = {
  id: number;
  name: string;
  display_name: string;
  description?: string | null;
  display_order: number;
};

type PlanFeatureItem = {
  text: string;
  available: boolean;
  display_order?: number;
  id?: number;
};

const BOOKINGS_FEATURE = {
  key: 'bookings',
  checkFunction: (plan: PlanLike): PlanFeatureItem => {
    if (plan.name === 'Free') {
      const limits = (plan.limits ?? {}) as { max_future_bookings?: number | null };
      const maxBookings =
        typeof limits.max_future_bookings === 'number' && limits.max_future_bookings > 0
          ? limits.max_future_bookings
          : 30;
      return { available: true, text: `${maxBookings} активных записей` };
    }
    return { available: true, text: 'Без ограничений на запись' };
  },
};

/** @see shared/subscriptionPlanFeatures.js getPlanFeatures */
export function getPlanFeaturesFromCatalog(
  plan: PlanLike,
  serviceFunctions: ServiceFunctionLike[] = [],
  isAlwaysFree = false
): PlanFeatureItem[] {
  if (!plan) return [];

  const features = (plan.features ?? {}) as { service_functions?: number[] };
  const planServiceFunctionIds = features.service_functions ?? [];

  const configFeatures: PlanFeatureItem[] = [BOOKINGS_FEATURE.checkFunction(plan)];

  const serviceFeatures: PlanFeatureItem[] = serviceFunctions.map((func) => ({
    available: isAlwaysFree || planServiceFunctionIds.includes(func.id),
    text: func.display_name?.trim() || func.name?.trim() || '',
    display_order: func.display_order ?? 0,
    id: func.id,
  }));

  const allFeatures = [...configFeatures, ...serviceFeatures];

  return allFeatures
    .filter((f) => f.available && f.text.length > 0)
    .sort((a, b) => {
      const orderA = a.display_order ?? 0;
      const orderB = b.display_order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return (a.id ?? 0) - (b.id ?? 0);
    });
}

export function getWelcomeFeaturesIncluded(
  plan: PlanLike,
  serviceFunctions: ServiceFunctionLike[]
): string[] {
  return getPlanFeaturesFromCatalog(plan, serviceFunctions, false)
    .map((feature) => feature.text)
    .filter((text, index, list) => list.indexOf(text) === index);
}
