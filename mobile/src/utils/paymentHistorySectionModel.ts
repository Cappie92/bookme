/**
 * Pure UI-model for subscription payment history section.
 * Used by the RN component and unit-tested without RTL.
 */

import type { SubscriptionPaymentHistoryItem } from './subscriptionBilling';
import {
  formatDurationMonthsLabel,
  formatHistoryDate,
  formatPaidAmountWithPoints,
  formatPaymentStatusLabel,
  formatPeriodRange,
  formatPricePerMonth,
  getHistoryPlanLabel,
  resolvePointsSpent,
  splitPaymentHistory,
} from './subscriptionBilling';

export type PaymentHistoryCardModel = {
  id: string;
  paidAtLabel: string;
  planLabel: string;
  durationLabel: string;
  amountLabel: string;
  pointsParts: Array<{ text: string; tone: 'spent' | 'earned' }>;
  monthlyLabel: string;
  periodLabel: string;
  statusLabel: string;
  isSuccessful: boolean;
};

export type PaymentHistorySectionModel = {
  loading: boolean;
  error: string | null;
  showEmpty: boolean;
  successful: PaymentHistoryCardModel[];
  other: PaymentHistoryCardModel[];
};

function toCardModel(item: SubscriptionPaymentHistoryItem): PaymentHistoryCardModel {
  const paid = formatPaidAmountWithPoints(
    item.amount_paid,
    resolvePointsSpent(item),
    item.points_earned
  );
  return {
    id: item.public_id || String(item.payment_id),
    paidAtLabel: formatHistoryDate(item.paid_at),
    planLabel: getHistoryPlanLabel(item),
    durationLabel: formatDurationMonthsLabel(item.duration_months),
    amountLabel: paid.amountLabel,
    pointsParts: paid.parts,
    monthlyLabel: formatPricePerMonth(item.monthly_price),
    periodLabel: formatPeriodRange(item.subscription_start_date, item.subscription_end_date),
    statusLabel: formatPaymentStatusLabel(item.status),
    isSuccessful: item.is_successful_purchase === true
      || (item.status === 'paid' && item.subscription_apply_status === 'applied'),
  };
}

export function buildPaymentHistorySectionModel(
  items: SubscriptionPaymentHistoryItem[],
  options: { loading?: boolean; error?: string | null } = {}
): PaymentHistorySectionModel {
  const loading = Boolean(options.loading);
  const error = options.error ?? null;
  const { successful, other } = splitPaymentHistory(items);
  const showEmpty = !loading && !error && successful.length === 0 && other.length === 0;

  return {
    loading,
    error,
    showEmpty,
    successful: successful.map(toCardModel),
    other: other.map(toCardModel),
  };
}
