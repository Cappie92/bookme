import type { PublicMasterProfile, PublicService } from '@src/services/api/publicMasters';

/** Бейдж скидки на услугу из loyalty_visual (публичные подсказки). */
export function getServiceDiscountBadge(
  profile: PublicMasterProfile,
  serviceId: number
): { label: string; percentRounded: number } | null {
  const list = profile.loyalty_visual?.service_discounts ?? [];
  const hit = list.find((d) => d.master_service_id === serviceId);
  if (!hit) return null;
  const percentRounded = Math.round(Number(hit.discount_percent) || 0);
  const label = (hit.label || '').trim();
  return {
    label: label || `−${percentRounded}%`,
    percentRounded,
  };
}

export function formatPriceRub(n: number): string {
  const v = Math.round(n * 100) / 100;
  if (Number.isInteger(v)) return `${v} ₽`;
  return `${v.toFixed(2)} ₽`;
}
