import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  RefreshControl,
  useWindowDimensions,
  type ListRenderItem,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@src/components/Card';
import { semanticRoles } from '@src/theme/colors';
import type { SubscriptionPaymentHistoryItem } from '@src/utils/subscriptionBilling';
import {
  buildPaymentHistorySectionModel,
  type PaymentHistoryModalListItem,
  type PaymentHistoryRowModel,
} from '@src/utils/paymentHistorySectionModel';

export type SubscriptionPaymentHistorySectionProps = {
  items: SubscriptionPaymentHistoryItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRefresh?: () => void | Promise<void>;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

function PointsToneText({ parts }: { parts: PaymentHistoryRowModel['pointsParts'] }) {
  if (!parts.length) return null;

  const numberParts = parts.map((part) => ({
    tone: part.tone,
    value: part.text.replace(/\s+\S+$/, '').replace(/^-/, '−'),
  }));
  const word = parts[parts.length - 1]?.text.replace(/^[+\-−0-9\u00A0\s]+/, '') || 'баллов';

  return (
    <Text style={styles.metaText}>
      {numberParts.map((part, index) => (
        <React.Fragment key={part.tone}>
          {index > 0 ? <Text style={styles.metaText}>{' / '}</Text> : null}
          <Text style={part.tone === 'spent' ? styles.pointsSpent : styles.pointsEarned}>
            {part.value}
          </Text>
        </React.Fragment>
      ))}
      <Text style={styles.metaText}>{` ${word}`}</Text>
    </Text>
  );
}

function CompactPaymentRow({
  row,
  testIdPrefix,
  showDivider,
}: {
  row: PaymentHistoryRowModel;
  testIdPrefix: string;
  showDivider: boolean;
}) {
  const secondaryChunks: React.ReactNode[] = [];
  if (row.hasSecondaryRow) {
    if (row.monthlyLabel && row.monthlyLabel !== '—') {
      secondaryChunks.push(
        <Text key="monthly" style={styles.metaText} testID={`payment-history-monthly-${row.id}`}>
          {row.monthlyLabel}
        </Text>
      );
    }
    if (row.periodLabel) {
      secondaryChunks.push(
        <Text key="period" style={styles.metaText} testID={`payment-history-period-${row.id}`}>
          {row.periodLabel}
        </Text>
      );
    }
    if (row.pointsCompactLine) {
      secondaryChunks.push(
        <PointsToneText key="points" parts={row.pointsParts} />
      );
    }
  }

  return (
    <View
      style={[styles.rowWrap, showDivider && styles.rowDivider]}
      testID={`${testIdPrefix}-${row.id}`}
      accessible
      accessibilityLabel={row.accessibilityLabel}
    >
      <View style={styles.primaryRow}>
        <Text style={styles.dateText} numberOfLines={1}>
          {row.paidAtLabel}
        </Text>
        <Text style={styles.planText} numberOfLines={1} ellipsizeMode="tail">
          {row.planDurationLabel}
        </Text>
        <Text style={styles.amountText} numberOfLines={1}>
          {row.amountLabel}
        </Text>
        {row.showStatusOnPrimaryRow ? (
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText} numberOfLines={1}>
              {row.statusLabel}
            </Text>
          </View>
        ) : (
          <Ionicons
            name="checkmark-circle"
            size={14}
            color={semanticRoles.statusSuccess}
            style={styles.statusIcon}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        )}
      </View>
      {secondaryChunks.length > 0 ? (
        <View style={styles.secondaryRow} testID={`payment-history-meta-${row.id}`}>
          {secondaryChunks.map((chunk, index) => (
            <React.Fragment key={index}>
              {index > 0 ? <Text style={styles.metaDot}>{' · '}</Text> : null}
              {chunk}
            </React.Fragment>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PaymentHistoryRows({
  rows,
  testIdPrefix,
}: {
  rows: PaymentHistoryRowModel[];
  testIdPrefix: string;
}) {
  if (!rows.length) return null;
  return (
    <View testID={`${testIdPrefix}-list`}>
      {rows.map((row, index) => (
        <CompactPaymentRow
          key={row.id}
          row={row}
          testIdPrefix={testIdPrefix}
          showDivider={index < rows.length - 1}
        />
      ))}
    </View>
  );
}

function PaymentHistoryFullModal({
  visible,
  onClose,
  model,
  refreshing,
  onRefresh,
  error,
  onRetry,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  model: ReturnType<typeof buildPaymentHistorySectionModel>;
  refreshing: boolean;
  onRefresh?: () => void | Promise<void>;
  error: string | null;
  onRetry?: () => void;
  testID: string;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.round(windowHeight * 0.82);

  const renderItem: ListRenderItem<PaymentHistoryModalListItem> = useCallback(({ item, index }) => {
    if (item.type === 'header') {
      return (
        <Text style={styles.modalSectionTitle} testID={`${testID}-other-header`}>
          {item.title}
        </Text>
      );
    }
    if (item.type === 'empty-success') {
      return (
        <Text style={styles.modalEmptySuccess} testID={`${testID}-modal-empty-success`}>
          {item.message}
        </Text>
      );
    }
    const isLast = index === model.modalListItems.length - 1;
    const next = model.modalListItems[index + 1];
    const showDivider = !isLast && next?.type === 'row';
    return (
      <CompactPaymentRow
        row={item.row}
        testIdPrefix={
          item.row.isSuccessful ? 'payment-history-row' : 'payment-history-other-row'
        }
        showDivider={showDivider}
      />
    );
  }, [model.modalListItems, testID]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      testID={`${testID}-modal`}
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Закрыть историю оплат"
        />
        <View
          style={[
            styles.modalSheet,
            {
              height: sheetHeight,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>История оплат</Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Закрыть"
              testID={`${testID}-modal-close`}
            >
              <Ionicons name="close" size={22} color="#657065" />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.centerBlock} testID={`${testID}-modal-error`}>
              <Text style={styles.errorText}>{error}</Text>
              {onRetry ? (
                <TouchableOpacity
                  testID={`${testID}-modal-retry`}
                  style={styles.retryButton}
                  onPress={onRetry}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryButtonText}>Повторить</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <FlatList
              data={model.modalListItems}
              keyExtractor={(item) => item.key}
              renderItem={renderItem}
              style={styles.modalList}
              contentContainerStyle={styles.modalListContent}
              showsVerticalScrollIndicator
              refreshControl={
                onRefresh ? (
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={[semanticRoles.actionPrimary]}
                  />
                ) : undefined
              }
              ListEmptyComponent={
                <Text style={styles.emptyText} testID={`${testID}-modal-empty`}>
                  История оплат пока пуста
                </Text>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Секция «История оплат»: превью 3 последних + bottom sheet с полной историей.
 */
export function SubscriptionPaymentHistorySection({
  items,
  loading = false,
  error = null,
  onRetry,
  onRefresh,
  testID = 'subscription-payment-history',
  style,
}: SubscriptionPaymentHistorySectionProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [modalRefreshing, setModalRefreshing] = useState(false);

  const model = useMemo(
    () => buildPaymentHistorySectionModel(items, { loading, error }),
    [items, loading, error]
  );

  const handleOpenModal = useCallback(() => {
    setModalVisible(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  const handleModalRefresh = useCallback(async () => {
    if (!onRefresh && !onRetry) return;
    setModalRefreshing(true);
    try {
      await (onRefresh ?? onRetry)?.();
    } finally {
      setModalRefreshing(false);
    }
  }, [onRefresh, onRetry]);

  return (
    <>
      <Card style={[styles.sectionCard, style]} testID={testID}>
        <Text style={styles.sectionTitle}>История оплат</Text>

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

        {!model.loading && !model.error && model.preview.length > 0 ? (
          <PaymentHistoryRows rows={model.preview} testIdPrefix="payment-history-preview" />
        ) : null}

        {!model.loading && !model.error && model.showAllButton ? (
          <TouchableOpacity
            testID={`${testID}-show-all`}
            style={styles.showAllButton}
            onPress={handleOpenModal}
            accessibilityRole="button"
            accessibilityLabel={model.showAllButtonLabel}
          >
            <Text style={styles.showAllButtonText}>{model.showAllButtonLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </Card>

      <PaymentHistoryFullModal
        visible={modalVisible}
        onClose={handleCloseModal}
        model={model}
        refreshing={modalRefreshing}
        onRefresh={onRefresh || onRetry ? handleModalRefresh : undefined}
        error={error}
        onRetry={onRetry}
        testID={testID}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    // margin задаётся родителем через единый SECTION_GAP
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: semanticRoles.textPrimary,
    marginBottom: 10,
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
    paddingVertical: 8,
  },
  rowWrap: {
    paddingVertical: 10,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticRoles.borderDefault,
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    width: 96,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '600',
    color: semanticRoles.textMuted,
  },
  planText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '700',
    color: semanticRoles.textPrimary,
  },
  amountText: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '800',
    color: semanticRoles.textPrimary,
  },
  statusIcon: {
    marginLeft: 2,
  },
  statusBadge: {
    maxWidth: 88,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#F3F4F6',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
  },
  secondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 4,
    paddingLeft: 96 + 8,
  },
  metaText: {
    fontSize: 11,
    color: semanticRoles.textMuted,
    fontWeight: '500',
  },
  metaDot: {
    fontSize: 11,
    color: semanticRoles.textMuted,
  },
  pointsSpent: {
    color: semanticRoles.metricNegative,
    fontWeight: '700',
    fontSize: 11,
  },
  pointsEarned: {
    color: semanticRoles.metricPositive,
    fontWeight: '700',
    fontSize: 11,
  },
  showAllButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
  },
  showAllButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: semanticRoles.actionPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: semanticRoles.surfaceCard,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: semanticRoles.textPrimary,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalList: {
    flex: 1,
  },
  modalListContent: {
    paddingBottom: 8,
  },
  modalSectionTitle: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: '800',
    color: semanticRoles.textPrimary,
  },
  modalEmptySuccess: {
    fontSize: 13,
    color: semanticRoles.textMuted,
    paddingVertical: 6,
  },
});
