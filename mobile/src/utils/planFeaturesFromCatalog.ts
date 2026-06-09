/**
 * Построение списка «Что входит / не входит» из pricing-catalog API.
 * Подписи service_functions — только display_name с сервера + лимит записей.
 * Порядок функций — по первому появлению в тарифах: Free → Basic → Pro → Premium.
 */

export type WelcomePlanFeatureRow = {
  text: string;
  available: boolean;
  display_order?: number;
  id?: number;
};

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

/** Ранг тарифа для product-order сортировки функций. */
export function planTierRank(planName: string): number {
  const key = planName.trim().toLowerCase();
  if (key === 'free') return 0;
  if (key === 'basic') return 1;
  if (
    key === 'pro' ||
    key.includes('standard') ||
    key.includes('standart') ||
    key.includes('стандарт')
  ) {
    return 2;
  }
  if (key === 'premium' || key.includes('premium') || key.includes('премиум')) {
    return 3;
  }
  return 99;
}

function planServiceFunctionIds(plan: PlanLike): number[] {
  return ((plan.features ?? {}) as { service_functions?: number[] }).service_functions ?? [];
}

function firstAppearanceTier(plans: PlanLike[], serviceFunctionId: number): number {
  let minTier = 99;
  for (const plan of plans) {
    if (planServiceFunctionIds(plan).includes(serviceFunctionId)) {
      minTier = Math.min(minTier, planTierRank(plan.name));
    }
  }
  return minTier;
}

export function sortServiceFunctionsByTierAppearance(
  plans: PlanLike[],
  serviceFunctions: ServiceFunctionLike[]
): ServiceFunctionLike[] {
  return [...serviceFunctions].sort((a, b) => {
    const tierA = firstAppearanceTier(plans, a.id);
    const tierB = firstAppearanceTier(plans, b.id);
    if (tierA !== tierB) return tierA - tierB;
    const orderA = a.display_order ?? 0;
    const orderB = b.display_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.id - b.id;
  });
}

function bookingsRow(plan: PlanLike): WelcomePlanFeatureRow {
  if (plan.name === 'Free') {
    const limits = (plan.limits ?? {}) as { max_future_bookings?: number | null };
    const maxBookings =
      typeof limits.max_future_bookings === 'number' && limits.max_future_bookings > 0
        ? limits.max_future_bookings
        : 30;
    return { available: true, text: `${maxBookings} активных записей`, display_order: 0, id: 0 };
  }
  return { available: true, text: 'Запись без ограничений', display_order: 0, id: 0 };
}

function sortByCatalogOrder(serviceFunctions: ServiceFunctionLike[]): ServiceFunctionLike[] {
  return [...serviceFunctions].sort((a, b) => {
    const orderA = a.display_order ?? 0;
    const orderB = b.display_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.id - b.id;
  });
}

/** Полный список: лимит записей + все service_functions в product-order. */
export function getPlanFeatureComparison(
  plan: PlanLike,
  serviceFunctions: ServiceFunctionLike[] = [],
  allPlans?: PlanLike[]
): WelcomePlanFeatureRow[] {
  if (!plan) return [];

  const planIds = planServiceFunctionIds(plan);
  const orderedFunctions =
    allPlans && allPlans.length > 0
      ? sortServiceFunctionsByTierAppearance(allPlans, serviceFunctions)
      : sortByCatalogOrder(serviceFunctions);

  const serviceRows: WelcomePlanFeatureRow[] = orderedFunctions
    .map((func) => ({
      available: planIds.includes(func.id),
      text: func.display_name?.trim() || func.name?.trim() || '',
      display_order: func.display_order ?? 0,
      id: func.id,
    }))
    .filter((row) => row.text.length > 0);

  return [bookingsRow(plan), ...serviceRows];
}

/** @deprecated используйте getPlanFeatureComparison */
export function getPlanFeaturesFromCatalog(
  plan: PlanLike,
  serviceFunctions: ServiceFunctionLike[] = [],
  isAlwaysFree = false
): WelcomePlanFeatureRow[] {
  void isAlwaysFree;
  return getPlanFeatureComparison(plan, serviceFunctions).filter((row) => row.available);
}

export function getWelcomeFeaturesIncluded(
  plan: PlanLike,
  serviceFunctions: ServiceFunctionLike[],
  allPlans?: PlanLike[]
): string[] {
  return getPlanFeatureComparison(plan, serviceFunctions, allPlans)
    .filter((row) => row.available)
    .map((row) => row.text)
    .filter((text, index, list) => list.indexOf(text) === index);
}
