import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Card } from '@src/components/Card';
import { semanticRoles } from '@src/theme/colors';
import type { SubscriptionPaymentHistoryItem } from '@src/utils/subscriptionBilling';
import {
  buildPaymentHistorySectionModel,
  type PaymentHistoryCardModel,
} from '@src/utils/paymentHistorySectionModel';

export type SubscriptionPaymentHistorySectionProps = {
  items: SubscriptionPaymentHistoryItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  testID?: string;
};

function PaidAmountRow({ card }: { card: PaymentHistoryCardModel }) {
  return (
    <View style={styles.paidAmountRow} testID="payment-history-paid-amount">
      <Text style={styles.rowValue}>{card.amountLabel}</Text>
      {card.pointsParts.length > 0 ? (
        <Text style={styles.pointsGroup}>
          {' ('}
          {card.pointsParts.map((part, index) => (
            <Text
              key={part.tone}
              style={part.tone === 'spent' ? styles.pointsSpent : styles.pointsEarned}
            >
              {index > 0 ? ', ' : ''}
              {part.text}
            </Text>
          ))}
          {')'}
        </Text>
      ) : null}
    </View>
  );
}

function PaymentHistoryCard({
  card,
  testIdPrefix,
}: {
  card: PaymentHistoryCardModel;
  testIdPrefix: string;
}) {
  return (
    <View
      style={[styles.historyCard, !card.isSuccessful && styles.historyCardOther]}
      testID={`${testIdPrefix}-${card.id}`}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardDate}>{card.paidAtLabel}</Text>
        <View
          style={[
            styles.statusBadge,
            card.isSuccessful ? styles.statusBadgeSuccess : styles.statusBadgeMuted,
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              card.isSuccessful ? styles.statusBadgeTextSuccess : styles.statusBadgeTextMuted,
            ]}
          >
            {card.statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.rowLabel}>Тариф</Text>
        <Text style={styles.rowValue}>{card.planLabel}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.rowLabel}>Срок пакета</Text>
        <Text style={styles.rowValue}>{card.durationLabel}</Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.rowLabel}>Оплачено</Text>
        <PaidAmountRow card={card} />
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.rowLabel}>Стоимость месяца</Text>
        <Text style={styles.rowValue} testID={`payment-history-monthly-${card.id}`}>
          {card.monthlyLabel}
        </Text>
      </View>
      <View style={styles.detailRow}>
        <Text style={styles.rowLabel}>Период</Text>
        <Text style={styles.rowValue} testID={`payment-history-period-${card.id}`}>
          {card.periodLabel}
        </Text>
      </View>
    </View>
  );
}

function PaymentHistoryCards({
  cards,
  testIdPrefix,
}: {
  cards: PaymentHistoryCardModel[];
  testIdPrefix: string;
}) {
  if (!cards.length) return null;
  return (
    <View style={styles.cardsList} testID={`${testIdPrefix}-list`}>
      {cards.map((card) => (
        <PaymentHistoryCard key={card.id} card={card} testIdPrefix={testIdPrefix} />
      ))}
    </View>
  );
}

/**
 * Секция «История оплат» для экрана тарифа мастера.
 * Карточки вместо desktop-таблицы; успешные и прочие попытки разделены.
 */
export function SubscriptionPaymentHistorySection({
  items,
  loading = false,
  error = null,
  onRetry,
  testID = 'subscription-payment-history',
}: SubscriptionPaymentHistorySectionProps) {
  const model = buildPaymentHistorySectionModel(items, { loading, error });

  return (
    <Card style={styles.sectionCard} testID={testID}>
      <Text style={styles.sectionTitle}>История оплат</Text>
      <Text style={styles.sectionDescription}>
        Успешные оплаты подписки и другие попытки оплаты.
      </Text>

      {model.loading ? (
        <View style={styles.centerBlock} testID={`${testID}-loading`}>
          <ActivityIndicator size="small" color={semanticRoles.actionPrimary} />
          <Text style={styles.loadingText}>Загрузка истории…</Text>
        </View>
      ) : null}

      {!model.loading && model.error ? (
        <View style={styles.centerBlock} testID={`${testID}-error`}>
          <Text style={styles.errorText}>{model.error}</Text>
          {onRetry ? (
            <TouchableOpacity
              testID={`${testID}-retry`}
              style={styles.retryButton}
              onPress={onRetry}
              accessibilityRole="button"
            >
              <Text style={styles.retryButtonText}>Повторить</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {!model.loading && !model.error && model.showEmpty ? (
        <Text testID={`${testID}-empty`} style={styles.emptyText}>
          История оплат пока пуста
        </Text>
      ) : null}

      {!model.loading && !model.error && model.successful.length > 0 ? (
        <PaymentHistoryCards cards={model.successful} testIdPrefix="payment-history-row" />
      ) : null}

      {!model.loading && !model.error && model.other.length > 0 ? (
        <View style={styles.otherBlock} testID={`${testID}-other`}>
          <Text style={styles.otherTitle}>Другие попытки оплаты</Text>
          <PaymentHistoryCards cards={model.other} testIdPrefix="payment-history-other-row" />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: semanticRoles.textPrimary,
    marginBottom: 6,
  },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: semanticRoles.textMuted,
    marginBottom: 14,
  },
  centerBlock: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: semanticRoles.textMuted,
  },
  errorText: {
    fontSize: 13,
    color: semanticRoles.statusError,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryButton: {
    borderWidth: 1,
    borderColor: semanticRoles.actionPrimary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: semanticRoles.actionPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  emptyText: {
    fontSize: 14,
    color: semanticRoles.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
  },
  cardsList: {
    gap: 12,
  },
  historyCard: {
    borderWidth: 1,
    borderColor: semanticRoles.borderDefault,
    borderRadius: 12,
    padding: 12,
    backgroundColor: semanticRoles.surfaceCard,
  },
  historyCardOther: {
    backgroundColor: semanticRoles.surfaceSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  cardDate: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: semanticRoles.textPrimary,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeSuccess: {
    backgroundColor: '#E8F5E9',
  },
  statusBadgeMuted: {
    backgroundColor: '#F3F4F6',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeTextSuccess: {
    color: '#1B5E20',
  },
  statusBadgeTextMuted: {
    color: '#4B5563',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  rowLabel: {
    flexShrink: 0,
    width: 120,
    fontSize: 13,
    color: semanticRoles.textMuted,
  },
  rowValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: semanticRoles.textPrimary,
    textAlign: 'right',
  },
  paidAmountRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  pointsGroup: {
    fontSize: 13,
    color: semanticRoles.textPrimary,
  },
  pointsSpent: {
    color: semanticRoles.metricNegative,
    fontWeight: '700',
  },
  pointsEarned: {
    color: semanticRoles.metricPositive,
    fontWeight: '700',
  },
  otherBlock: {
    marginTop: 18,
  },
  otherTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: semanticRoles.textPrimary,
    marginBottom: 10,
  },
});
