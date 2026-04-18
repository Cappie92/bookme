/**
 * Единая функция для отображения названия тарифа в UI.
 * Использует plan_display_name (из админки), если задано; иначе fallback на plan_name.
 */
export const getPlanTitle = (s?: {
  plan_display_name?: string | null;
  plan_name?: string | null;
}): string =>
  s?.plan_display_name && s.plan_display_name.trim().length > 0
    ? s.plan_display_name.trim()
    : (s?.plan_name ?? '');
