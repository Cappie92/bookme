/**
 * Отображение фактической стоимости подписки и истории оплат.
 * Паритет с frontend/src/utils/subscriptionBilling.js — без пересчёта
 * package/monthly из subscription.price.
 */

import { formatMoney } from './money';

export type SubscriptionPaymentHistoryItem = {
  payment_id: number;
  public_id: string;
  paid_at?: string | null;
  plan_name?: string | null;
  plan_display_name?: string | null;
  duration_months: number;
  amount_paid: number;
  points_used?: number;
  points_spent?: number;
  points_earned?: number;
  package_value: number;
  monthly_price: number;
  subscription_start_date?: string | null;
  subscription_end_date?: string | null;
  status: string;
  subscription_apply_status?: string | null;
  is_successful_purchase?: boolean;
};

export type PaidAmountPart = {
  text: string;
  tone: 'spent' | 'earned';
};

/**
 * Локальный fallback для monthly_price только если backend не отдал значение.
 * Не использовать для history-карточек, где monthly_price уже приходит с API.
 */
export function computeMonthlyPrice(
  packageValue: number | null | undefined,
  durationMonths: number | null | undefined
): number | null {
  const months = Number(durationMonths);
  const value = Number(packageValue);
  if (!Number.isFinite(months) || months <= 0 || !Number.isFinite(value)) {
    return null;
  }
  return Math.round((value / months) * 100) / 100;
}

export function formatPricePerMonth(monthlyPrice: number | null | undefined): string {
  if (monthlyPrice == null || Number.isNaN(Number(monthlyPrice))) {
    return '—';
  }
  const value = Math.round(Number(monthlyPrice) * 100) / 100;
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted} ₽/мес`;
}

export function formatDurationMonthsLabel(durationMonths: number | null | undefined): string {
  const months = Number(durationMonths);
  if (!Number.isFinite(months) || months <= 0) return '—';
  const mod10 = months % 10;
  const mod100 = months % 100;
  let word = 'месяцев';
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) word = 'месяц';
    else if (mod10 >= 2 && mod10 <= 4) word = 'месяца';
  }
  return `${months} ${word}`;
}

/** Компактный срок для строки истории: «3 мес.» */
export function formatDurationMonthsCompact(durationMonths: number | null | undefined): string {
  const months = Number(durationMonths);
  if (!Number.isFinite(months) || months <= 0) return '—';
  return `${months} мес.`;
}

export function formatPackageSummary(
  durationMonths: number | null | undefined,
  packageValue: number | null | undefined
): string | null {
  if (durationMonths == null || packageValue == null) return null;
  const durationLabel = formatDurationMonthsLabel(durationMonths);
  const amount = formatMoney(packageValue).replace(/[\u00A0 ]₽$/, '').trim();
  return `Пакет: ${durationLabel} за ${amount} ₽`;
}

/**
 * Период подписки. subscription_end_date уже display-inclusive с backend —
 * не вычитать день на клиенте.
 */
export function formatPeriodRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string {
  const formatShort = (dateString: string | null | undefined): string | null => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return null;
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yy = String(date.getUTCFullYear()).slice(-2);
    return `${dd}.${mm}.${yy}`;
  };

  const start = formatShort(startDate);
  const end = formatShort(endDate);
  if (!start || !end) return '—';
  return `${start}–${end}`;
}

/** Период или null, если дат нет (не показывать «Период —»). */
export function formatPeriodRangeOrNull(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string | null {
  const value = formatPeriodRange(startDate, endDate);
  return value === '—' ? null : value;
}

export function formatPointsWord(points: number | null | undefined): string {
  const value = Math.abs(Number(points));
  if (!Number.isFinite(value) || value <= 0) return 'баллов';
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) return 'балл';
    if (mod10 >= 2 && mod10 <= 4) return 'балла';
  }
  return 'баллов';
}

function formatPointsCount(points: number): string {
  return Math.round(points).toLocaleString('ru-RU');
}

export function formatPaidAmountWithPoints(
  amountPaid: number | null | undefined,
  pointsSpent: number | null | undefined,
  pointsEarned: number | null | undefined
): { amountLabel: string; parts: PaidAmountPart[] } {
  const spent = Math.round(Number(pointsSpent ?? 0));
  const earned = Math.round(Number(pointsEarned ?? 0));
  const parts: PaidAmountPart[] = [];
  if (spent > 0) {
    parts.push({
      text: `-${formatPointsCount(spent)} ${formatPointsWord(spent)}`,
      tone: 'spent',
    });
  }
  if (earned > 0) {
    parts.push({
      text: `+${formatPointsCount(earned)} ${formatPointsWord(earned)}`,
      tone: 'earned',
    });
  }
  return {
    amountLabel: formatMoney(amountPaid),
    parts,
  };
}

/** points_spent с fallback на points_used для обратной совместимости. */
export function resolvePointsSpent(item: {
  points_spent?: number | null;
  points_used?: number | null;
}): number {
  const spent = item.points_spent;
  if (spent != null && Number.isFinite(Number(spent))) {
    return Math.round(Number(spent));
  }
  return Math.round(Number(item.points_used ?? 0));
}

export function formatPaymentBreakdown(
  amountPaid: number | null | undefined,
  pointsUsed: number | null | undefined
): string | null {
  const paid = Math.round(Number(amountPaid || 0));
  const points = Math.round(Number(pointsUsed || 0));
  if (points <= 0) return null;
  const paidLabel = paid > 0 ? formatMoney(paid).replace(/[\u00A0 ]₽$/, '').trim() : '0';
  return `Оплачено деньгами ${paidLabel} ₽ + ${formatPointsCount(points)} баллов`;
}

export function resolveSubscriptionCostDisplay(subscription: {
  monthly_price?: number | null;
  package_value?: number | null;
  duration_months?: number | null;
  amount_paid?: number | null;
  points_used?: number | null;
  points_spent?: number | null;
  price?: number | null;
} | null): {
  monthlyLabel: string;
  packageSummary: string | null;
  paymentBreakdown: string | null;
} {
  if (!subscription) {
    return { monthlyLabel: '—', packageSummary: null, paymentBreakdown: null };
  }

  return {
    monthlyLabel: formatPricePerMonth(subscription.monthly_price),
    packageSummary: formatPackageSummary(
      subscription.duration_months,
      subscription.package_value
    ),
    paymentBreakdown: formatPaymentBreakdown(
      subscription.amount_paid,
      subscription.points_used ?? subscription.points_spent
    ),
  };
}

export function isSuccessfulSubscriptionPayment(item: {
  status?: string;
  subscription_apply_status?: string | null;
  is_successful_purchase?: boolean;
} | null | undefined): boolean {
  if (!item) return false;
  if (item.is_successful_purchase === true) return true;
  return item.status === 'paid' && item.subscription_apply_status === 'applied';
}

export function formatPaymentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'paid':
      return 'Оплачен';
    case 'pending':
      return 'В обработке';
    case 'failed':
      return 'Не прошёл';
    case 'cancelled':
      return 'Отменён';
    case 'expired':
      return 'Истёк';
    default:
      return status || '—';
  }
}

export function formatHistoryDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Компактная дата строки истории: «16 июл. 2026». */
export function formatHistoryDateCompact(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Компактная строка баллов: «−481 / +321 балл».
 * Цвета применяются в UI по tone частей formatPaidAmountWithPoints.
 */
export function formatCompactPointsLine(
  pointsSpent: number | null | undefined,
  pointsEarned: number | null | undefined
): string | null {
  const spent = Math.round(Number(pointsSpent ?? 0));
  const earned = Math.round(Number(pointsEarned ?? 0));
  const chunks: string[] = [];
  if (spent > 0) chunks.push(`−${spent.toLocaleString('ru-RU')}`);
  if (earned > 0) chunks.push(`+${earned.toLocaleString('ru-RU')}`);
  if (!chunks.length) return null;
  const word = formatPointsWord(earned > 0 ? earned : spent);
  return `${chunks.join(' / ')} ${word}`;
}

export function getPaymentHistorySortTime(item: {
  paid_at?: string | null;
  payment_id?: number;
}): number {
  if (item.paid_at) {
    const ms = new Date(item.paid_at).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return Number(item.payment_id) || 0;
}

export function sortPaymentHistoryByDateDesc<T extends {
  paid_at?: string | null;
  payment_id?: number;
}>(items: T[] = []): T[] {
  return [...items].sort((a, b) => {
    const diff = getPaymentHistorySortTime(b) - getPaymentHistorySortTime(a);
    if (diff !== 0) return diff;
    return (Number(b.payment_id) || 0) - (Number(a.payment_id) || 0);
  });
}

export function splitPaymentHistory<T extends {
  is_successful_purchase?: boolean;
  status?: string;
  subscription_apply_status?: string | null;
}>(items: T[] = []): { successful: T[]; other: T[] } {
  const successful: T[] = [];
  const other: T[] = [];
  for (const item of items) {
    if (isSuccessfulSubscriptionPayment(item)) {
      successful.push(item);
    } else {
      other.push(item);
    }
  }
  return { successful, other };
}

export function getHistoryPlanLabel(item: {
  plan_display_name?: string | null;
  plan_name?: string | null;
}): string {
  return item.plan_display_name || item.plan_name || 'Подписка';
}
