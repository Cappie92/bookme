type PlanLike = {
  name?: string | null;
  features?: Record<string, unknown> | null;
  limits?: Record<string, unknown> | null;
};

type ServiceFunctionLike = {
  id: number;
  name?: string | null;
  display_name?: string | null;
  display_order?: number | null;
};

function planServiceFunctionIds(plan: PlanLike): number[] {
  const features = (plan.features ?? {}) as { service_functions?: unknown };
  const ids = features.service_functions;
  return Array.isArray(ids) ? ids.filter((id): id is number => typeof id === 'number') : [];
}

export function getSubscriptionPlanFeatureLabels(
  plan: PlanLike,
  serviceFunctions: ServiceFunctionLike[] = []
): string[] {
  if (!plan) return [];

  const planIds = planServiceFunctionIds(plan);
  const serviceLabels = [...serviceFunctions]
    .sort((a, b) => {
      const orderA = a.display_order ?? 0;
      const orderB = b.display_order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.id - b.id;
    })
    .filter((func) => planIds.includes(func.id))
    .map((func) => (func.display_name || func.name || '').trim())
    .filter(Boolean);

  return ['Без ограничений на запись', ...serviceLabels].filter(
    (label, index, labels) => labels.indexOf(label) === index
  );
}
