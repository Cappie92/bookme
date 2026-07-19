/**
 * Pure UI-model for subscription payment history section.
 * Used by the RN component and unit-tested without RTL.
 */

import type { SubscriptionPaymentHistoryItem, PaidAmountPart } from './subscriptionBilling';
import {
  formatCompactPointsLine,
  formatDurationMonthsLabel,
  formatHistoryDate,
  formatPaidAmountWithPoints,
  formatPaymentStatusLabel,
  formatPeriodRangeOrNull,
  formatPricePerMonth,
  getHistoryPlanLabel,
  isSuccessfulSubscriptionPayment,
  resolvePointsSpent,
  sortPaymentHistoryByDateDesc,
  splitPaymentHistory,
} from './subscriptionBilling';
import { formatMoney } from './money';

export const PAYMENT_HISTORY_PREVIEW_LIMIT = 3;

export type PaymentHistoryDetailField = {
  key: string;
  label: string;
  value: string;
  tone?: 'spent' | 'earned' | 'muted' | 'default';
};

export type PaymentHistoryRowModel = {
  id: string;
  paymentId: number;
  publicId: string;
  paidAtMs: number;
  /** Compact preview: «Premium · 3 месяца» — без даты */
  planDurationLabel: string;
  planLabel: string;
  durationLabel: string;
  amountLabel: string;
  statusLabel: string;
  isSuccessful: boolean;
  /** Preview accessibility: тариф, срок, сумма, статус — без даты/периода/баллов */
  previewAccessibilityLabel: string;
  statusAccessibilityLabel: string;
  /** Full detail fields (hidden when empty) */
  detailFields: PaymentHistoryDetailField[];
  /** Raw values for tests */
  paidAtRaw: string | null;
  packageValue: number;
  monthlyPrice: number;
  amountPaid: number;
  pointsSpent: number;
  pointsEarned: number;
  periodLabel: string | null;
  dateLabel: string | null;
  pointsParts: PaidAmountPart[];
  pointsCompactLine: string | null;
  monthlyLabel: string;
  errorMessage: string | null;
};

export type PaymentHistoryModalListItem =
  | { type: 'header'; key: string; title: string }
  | { type: 'empty-success'; key: string; message: string }
  | { type: 'row'; key: string; row: PaymentHistoryRowModel };

export type PaymentHistorySectionModel = {
  loading: boolean;
  error: string | null;
  showEmpty: boolean;
  totalCount: number;
  preview: PaymentHistoryRowModel[];
  showAllButton: boolean;
  showAllButtonLabel: string;
  successful: PaymentHistoryRowModel[];
  other: PaymentHistoryRowModel[];
  allSorted: PaymentHistoryRowModel[];
  modalListItems: PaymentHistoryModalListItem[];
  showSuccessfulEmptyInModal: boolean;
  rowsById: Record<string, PaymentHistoryRowModel>;
};

function buildDetailFields(item: SubscriptionPaymentHistoryItem): {
  fields: PaymentHistoryDetailField[];
  dateLabel: string | null;
  periodLabel: string | null;
  pointsSpent: number;
  pointsEarned: number;
  pointsParts: PaidAmountPart[];
  pointsCompactLine: string | null;
  monthlyLabel: string;
  errorMessage: string | null;
} {
  const statusLabel = formatPaymentStatusLabel(item.status);
  const dateLabel = item.paid_at ? formatHistoryDate(item.paid_at) : null;
  const planLabel = getHistoryPlanLabel(item);
  const durationLabel = formatDurationMonthsLabel(item.duration_months);
  const pointsSpent = resolvePointsSpent(item);
  const pointsEarned = Math.round(Number(item.points_earned ?? 0));
  const paid = formatPaidAmountWithPoints(item.amount_paid, pointsSpent, pointsEarned);
  const periodLabel = formatPeriodRangeOrNull(
    item.subscription_start_date,
    item.subscription_end_date
  );
  const monthlyLabel = formatPricePerMonth(item.monthly_price);
  const pointsCompactLine = formatCompactPointsLine(pointsSpent, pointsEarned);
  // History API currently has no failure/error message field.
  const errorMessage =
    typeof (item as { error_message?: string | null }).error_message === 'string'
      ? (item as { error_message?: string | null }).error_message || null
      : null;

  const fields: PaymentHistoryDetailField[] = [];
  fields.push({ key: 'status', label: 'Статус', value: statusLabel });

  if (dateLabel) {
    fields.push({
      key: 'date',
      label: item.is_successful_purchase || item.status === 'paid' ? 'Дата оплаты' : 'Дата',
      value: dateLabel,
    });
  }

  fields.push({ key: 'plan', label: 'Тариф', value: planLabel });
  if (durationLabel && durationLabel !== '—') {
    fields.push({ key: 'duration', label: 'Срок пакета', value: durationLabel });
  }

  if (item.package_value != null && Number.isFinite(Number(item.package_value))) {
    fields.push({
      key: 'package',
      label: 'Полная стоимость пакета',
      value: formatMoney(item.package_value),
    });
  }

  if (item.amount_paid != null && Number.isFinite(Number(item.amount_paid))) {
    fields.push({
      key: 'amount',
      label: 'Оплачено деньгами',
      value: formatMoney(item.amount_paid),
    });
  }

  if (pointsSpent > 0) {
    fields.push({
      key: 'points_spent',
      label: 'Списано баллов',
      value: `−${pointsSpent.toLocaleString('ru-RU')}`,
      tone: 'spent',
    });
  }

  if (pointsEarned > 0) {
    fields.push({
      key: 'points_earned',
      label: 'Начислено баллов',
      value: `+${pointsEarned.toLocaleString('ru-RU')}`,
      tone: 'earned',
    });
  }

  if (monthlyLabel && monthlyLabel !== '—') {
    fields.push({ key: 'monthly', label: 'Стоимость месяца', value: monthlyLabel });
  }

  if (periodLabel) {
    fields.push({ key: 'period', label: 'Период подписки', value: periodLabel });
  }

  if (errorMessage) {
    fields.push({ key: 'error', label: 'Ошибка', value: errorMessage, tone: 'spent' });
  }

  return {
    fields,
    dateLabel,
    periodLabel,
    pointsSpent,
    pointsEarned,
    pointsParts: paid.parts,
    pointsCompactLine,
    monthlyLabel,
    errorMessage,
  };
}

function toRowModel(item: SubscriptionPaymentHistoryItem): PaymentHistoryRowModel {
  const planLabel = getHistoryPlanLabel(item);
  const durationLabel = formatDurationMonthsLabel(item.duration_months);
  const statusLabel = formatPaymentStatusLabel(item.status);
  const isSuccessful = isSuccessfulSubscriptionPayment(item);
  const paid = formatPaidAmountWithPoints(
    item.amount_paid,
    resolvePointsSpent(item),
    item.points_earned
  );
  const detail = buildDetailFields(item);
  const paidAtMs = item.paid_at ? new Date(item.paid_at).getTime() : Number(item.payment_id) || 0;
  const id = item.public_id || String(item.payment_id);

  return {
    id,
    paymentId: item.payment_id,
    publicId: item.public_id,
    paidAtMs: Number.isFinite(paidAtMs) ? paidAtMs : Number(item.payment_id) || 0,
    planDurationLabel: `${planLabel} · ${durationLabel}`,
    planLabel,
    durationLabel,
    amountLabel: paid.amountLabel,
    statusLabel,
    isSuccessful,
    previewAccessibilityLabel: [planLabel, durationLabel, paid.amountLabel, statusLabel]
      .filter(Boolean)
      .join(', '),
    statusAccessibilityLabel: `Статус: ${statusLabel}. Открыть детали оплаты`,
    detailFields: detail.fields,
    paidAtRaw: item.paid_at ?? null,
    packageValue: Number(item.package_value),
    monthlyPrice: Number(item.monthly_price),
    amountPaid: Number(item.amount_paid),
    pointsSpent: detail.pointsSpent,
    pointsEarned: detail.pointsEarned,
    periodLabel: detail.periodLabel,
    dateLabel: detail.dateLabel,
    pointsParts: detail.pointsParts,
    pointsCompactLine: detail.pointsCompactLine,
    monthlyLabel: detail.monthlyLabel,
    errorMessage: detail.errorMessage,
  };
}

export function buildPaymentHistoryModalListItems(
  successful: PaymentHistoryRowModel[],
  other: PaymentHistoryRowModel[]
): PaymentHistoryModalListItem[] {
  const items: PaymentHistoryModalListItem[] = [];

  if (successful.length > 0) {
    for (const row of successful) {
      items.push({ type: 'row', key: `success-${row.id}`, row });
    }
  } else if (other.length > 0) {
    items.push({
      type: 'empty-success',
      key: 'empty-success',
      message: 'Успешных оплат пока нет',
    });
  }

  if (other.length > 0) {
    items.push({
      type: 'header',
      key: 'other-header',
      title: 'Другие попытки оплаты',
    });
    for (const row of other) {
      items.push({ type: 'row', key: `other-${row.id}`, row });
    }
  }

  return items;
}

export function buildPaymentHistorySectionModel(
  items: SubscriptionPaymentHistoryItem[],
  options: { loading?: boolean; error?: string | null } = {}
): PaymentHistorySectionModel {
  const loading = Boolean(options.loading);
  const error = options.error ?? null;
  const sortedSource = sortPaymentHistoryByDateDesc(items);
  const allSorted = sortedSource.map(toRowModel);
  const { successful: successfulRaw, other: otherRaw } = splitPaymentHistory(sortedSource);
  const successful = successfulRaw.map(toRowModel);
  const other = otherRaw.map(toRowModel);
  const totalCount = allSorted.length;
  const showEmpty = !loading && !error && totalCount === 0;
  const preview = allSorted.slice(0, PAYMENT_HISTORY_PREVIEW_LIMIT);
  const showAllButton = totalCount >= 1;

  const rowsById: Record<string, PaymentHistoryRowModel> = {};
  for (const row of allSorted) {
    rowsById[row.id] = row;
  }

  return {
    loading,
    error,
    showEmpty,
    totalCount,
    preview,
    showAllButton,
    showAllButtonLabel: `Вся история (${totalCount})`,
    successful,
    other,
    allSorted,
    modalListItems: buildPaymentHistoryModalListItems(successful, other),
    showSuccessfulEmptyInModal: successful.length === 0 && other.length > 0,
    rowsById,
  };
}

/**
 * Android Back / close stacking for nested modals.
 * Returns which layer should close first.
 */
export function resolvePaymentHistoryBackAction(state: {
  detailVisible: boolean;
  listVisible: boolean;
}): 'close-detail' | 'close-list' | 'none' {
  if (state.detailVisible) return 'close-detail';
  if (state.listVisible) return 'close-list';
  return 'none';
}
