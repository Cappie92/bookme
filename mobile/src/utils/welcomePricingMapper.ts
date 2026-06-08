import type {
  PricingCatalogPlan,
  PricingCatalogResponse,
  PricingCatalogServiceFunction,
} from '@src/services/api/subscriptions';
import type { WelcomePricingPlan } from '@src/data/welcomePricingData';
import { getWelcomeFeaturesIncluded } from '@src/utils/planFeaturesFromCatalog';

function planIdFromApi(plan: PricingCatalogPlan): string {
  return plan.name.toLowerCase();
}

/**
 * «Что входит» из live API: plan.features.service_functions + plan.limits,
 * подписи — service_functions[].display_name из pricing-catalog.
 * Локальные строки только для лимита записей (как shared/subscriptionPlanFeatures.js).
 */
function buildFeaturesIncluded(
  plan: PricingCatalogPlan,
  serviceFunctions: PricingCatalogServiceFunction[]
): string[] {
  return getWelcomeFeaturesIncluded(plan, serviceFunctions);
}

function resolvePopularPlanName(plans: PricingCatalogPlan[]): string | null {
  const paid = plans.filter((p) => (p.price_1month ?? 0) > 0);
  if (paid.length === 0) return null;
  const sorted = [...paid].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const middle = sorted[Math.floor(sorted.length / 2)];
  return middle?.name ?? null;
}

export function mapPricingCatalogPlanToWelcomePlan(
  plan: PricingCatalogPlan,
  serviceFunctions: PricingCatalogServiceFunction[],
  popularPlanName: string | null
): WelcomePricingPlan {
  return {
    id: planIdFromApi(plan),
    name: plan.name,
    displayName: plan.display_name?.trim() || plan.name,
    price1Month: Number(plan.price_1month) || 0,
    price3Months: Number(plan.price_3months) || 0,
    price6Months: Number(plan.price_6months) || 0,
    price12Months: Number(plan.price_12months) || 0,
    featuresIncluded: buildFeaturesIncluded(plan, serviceFunctions),
    popular: popularPlanName != null && plan.name === popularPlanName,
    apiPlanId: plan.id,
  };
}

export function mapPricingCatalogToWelcomePlans(
  catalog: PricingCatalogResponse
): WelcomePricingPlan[] {
  const apiPlans = (catalog.plans ?? []).filter((p) => p.is_active !== false);
  const serviceFunctions = catalog.service_functions ?? [];
  const popularPlanName = resolvePopularPlanName(apiPlans);

  return [...apiPlans]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.id - b.id)
    .map((plan) => mapPricingCatalogPlanToWelcomePlan(plan, serviceFunctions, popularPlanName));
}

export function resolveDefaultWelcomePlanId(plans: WelcomePricingPlan[]): string {
  if (plans.length === 0) return 'pro';
  const popular = plans.find((p) => p.popular);
  if (popular) return popular.id;
  const firstPaid = plans.find((p) => p.price1Month > 0);
  return firstPaid?.id ?? plans[0].id;
}

export function ensureWelcomeSelectedPlanId(
  plans: WelcomePricingPlan[],
  selectedPlanId: string
): string {
  if (plans.some((p) => p.id === selectedPlanId)) return selectedPlanId;
  return resolveDefaultWelcomePlanId(plans);
}
