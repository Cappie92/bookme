import type { LoyaltySettings } from '@src/services/api/loyalty';

type AccrualSummaryInput = Pick<
  LoyaltySettings,
  'is_enabled' | 'accrual_percent' | 'max_payment_percent' | 'points_lifetime_days'
>;

const LIFETIME_LABELS: Record<number, string> = {
  14: '14 дней',
  30: '30 дней',
  60: '60 дней',
  90: '90 дней',
  180: '180 дней',
  365: '365 дней',
};

function buildAccrualRuleLines(settings: AccrualSummaryInput): string[] {
  const lines: string[] = [];

  if (settings.accrual_percent != null && settings.accrual_percent >= 1) {
    lines.push(`${settings.accrual_percent}% от стоимости услуги начисляется баллами`);
  }

  if (settings.max_payment_percent != null && settings.max_payment_percent >= 1) {
    lines.push(`До ${settings.max_payment_percent}% услуги можно оплатить баллами`);
  }

  if (settings.points_lifetime_days != null) {
    const label = LIFETIME_LABELS[settings.points_lifetime_days];
    lines.push(
      label
        ? `Срок действия баллов: ${label}`
        : `Срок действия баллов: ${settings.points_lifetime_days} дней`
    );
  } else if (settings.is_enabled) {
    lines.push('Срок действия баллов: без ограничения');
  }

  lines.push('Баллы начисляются после завершения записи');
  return lines;
}

/**
 * Краткое описание сохранённых настроек начисления баллов (только поля API).
 */
export function formatLoyaltyAccrualSummaryLines(settings: AccrualSummaryInput): string[] {
  if (!settings.is_enabled) {
    const saved = buildAccrualRuleLines({ ...settings, is_enabled: true });
    const hasSaved =
      (settings.accrual_percent != null && settings.accrual_percent >= 1) ||
      (settings.max_payment_percent != null && settings.max_payment_percent >= 1) ||
      settings.points_lifetime_days != null;
    if (hasSaved) {
      return ['Программа лояльности выключена', ...saved];
    }
    return ['Программа лояльности выключена'];
  }

  const lines = buildAccrualRuleLines(settings);

  const hasNumericRule =
    (settings.accrual_percent != null && settings.accrual_percent >= 1) ||
    (settings.max_payment_percent != null && settings.max_payment_percent >= 1);

  if (!hasNumericRule) {
    return ['Правило начисления настроено', ...lines];
  }

  return lines;
}

export function formatLoyaltyAccrualSummaryText(settings: AccrualSummaryInput): string {
  return formatLoyaltyAccrualSummaryLines(settings).join('\n');
}
