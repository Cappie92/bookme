/**
 * Построение списка «Что входит / не входит» из pricing-catalog API.
 * Подписи service_functions — только display_name с сервера + лимит записей.
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

function sortFeatureRows(rows: WelcomePlanFeatureRow[]): WelcomePlanFeatureRow[] {
  return [...rows].sort((a, b) => {
    const orderA = a.display_order ?? 0;
    const orderB = b.display_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

/** Полный список: лимит записей + все service_functions из каталога API. */
export function getPlanFeatureComparison(
  plan: PlanLike,
  serviceFunctions: ServiceFunctionLike[] = []
): WelcomePlanFeatureRow[] {
  if (!plan) return [];

  const planServiceFunctionIds =
    ((plan.features ?? {}) as { service_functions?: number[] }).service_functions ?? [];

  const serviceRows: WelcomePlanFeatureRow[] = [...serviceFunctions]
    .map((func) => ({
      available: planServiceFunctionIds.includes(func.id),
      text: func.display_name?.trim() || func.name?.trim() || '',
      display_order: func.display_order ?? 0,
      id: func.id,
    }))
    .filter((row) => row.text.length > 0);

  return sortFeatureRows([bookingsRow(plan), ...serviceRows]);
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
  serviceFunctions: ServiceFunctionLike[]
): string[] {
  return getPlanFeatureComparison(plan, serviceFunctions)
    .filter((row) => row.available)
    .map((row) => row.text)
    .filter((text, index, list) => list.indexOf(text) === index);
}
