/**
 * Pure UI-model for subscription payment history section.
 * Used by the RN component and unit-tested without RTL.
 */

import type { SubscriptionPaymentHistoryItem, PaidAmountPart } from './subscriptionBilling';
import {
  formatCompactPointsLine,
  formatDurationMonthsCompact,
  formatHistoryDate,
  formatHistoryDateCompact,
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

export const PAYMENT_HISTORY_PREVIEW_LIMIT = 3;

export type PaymentHistoryRowModel = {
  id: string;
  paidAtMs: number;
  paidAtLabel: string;
  planLabel: string;
  durationCompact: string;
  planDurationLabel: string;
  amountLabel: string;
  monthlyLabel: string;
  periodLabel: string | null;
  pointsParts: PaidAmountPart[];
  pointsCompactLine: string | null;
  statusLabel: string;
  isSuccessful: boolean;
  showStatusOnPrimaryRow: boolean;
  hasSecondaryRow: boolean;
  accessibilityLabel: string;
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
};

function toRowModel(item: SubscriptionPaymentHistoryItem): PaymentHistoryRowModel {
  const paid = formatPaidAmountWithPoints(
    item.amount_paid,
    resolvePointsSpent(item),
    item.points_earned
  );
  const planLabel = getHistoryPlanLabel(item);
  const durationCompact = formatDurationMonthsCompact(item.duration_months);
  const periodLabel = formatPeriodRangeOrNull(
    item.subscription_start_date,
    item.subscription_end_date
  );
  const monthlyLabel = formatPricePerMonth(item.monthly_price);
  const statusLabel = formatPaymentStatusLabel(item.status);
  const isSuccessful = isSuccessfulSubscriptionPayment(item);
  const pointsCompactLine = formatCompactPointsLine(
    resolvePointsSpent(item),
    item.points_earned
  );
  const hasSecondaryRow =
    isSuccessful &&
    Boolean(
      (monthlyLabel && monthlyLabel !== '—') ||
        periodLabel ||
        pointsCompactLine
    );

  const paidAtLabel = formatHistoryDateCompact(item.paid_at);
  const fullDate = formatHistoryDate(item.paid_at);
  const accessibilityParts = [
    fullDate,
    planLabel,
    durationCompact,
    paid.amountLabel,
    statusLabel,
  ];
  if (monthlyLabel && monthlyLabel !== '—') accessibilityParts.push(monthlyLabel);
  if (periodLabel) accessibilityParts.push(periodLabel);
  if (pointsCompactLine) accessibilityParts.push(pointsCompactLine);

  const paidAtMs = item.paid_at ? new Date(item.paid_at).getTime() : Number(item.payment_id) || 0;

  return {
    id: item.public_id || String(item.payment_id),
    paidAtMs: Number.isFinite(paidAtMs) ? paidAtMs : Number(item.payment_id) || 0,
    paidAtLabel,
    planLabel,
    durationCompact,
    planDurationLabel: `${planLabel} · ${durationCompact}`,
    amountLabel: paid.amountLabel,
    monthlyLabel,
    periodLabel,
    pointsParts: paid.parts,
    pointsCompactLine,
    statusLabel,
    isSuccessful,
    showStatusOnPrimaryRow: !isSuccessful,
    hasSecondaryRow,
    accessibilityLabel: accessibilityParts.filter(Boolean).join(', '),
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
  // Keep successful/other in the same date-desc order as sortedSource
  const successful = successfulRaw.map(toRowModel);
  const other = otherRaw.map(toRowModel);
  const totalCount = allSorted.length;
  const showEmpty = !loading && !error && totalCount === 0;
  const preview = allSorted.slice(0, PAYMENT_HISTORY_PREVIEW_LIMIT);
  const showAllButton = totalCount > PAYMENT_HISTORY_PREVIEW_LIMIT;

  return {
    loading,
    error,
    showEmpty,
    totalCount,
    preview,
    showAllButton,
    showAllButtonLabel: `Показать всю историю (${totalCount})`,
    successful,
    other,
    allSorted,
    modalListItems: buildPaymentHistoryModalListItems(successful, other),
    showSuccessfulEmptyInModal: successful.length === 0 && other.length > 0,
  };
}
