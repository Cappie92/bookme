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
  ScrollView,
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
  resolvePaymentHistoryBackAction,
  type PaymentHistoryModalListItem,
  type PaymentHistoryRowModel,
} from '@src/utils/paymentHistorySectionModel';
import { analytics, AnalyticsEvent } from '@src/services/analytics';

export type SubscriptionPaymentHistorySectionProps = {
  items: SubscriptionPaymentHistoryItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRefresh?: () => void | Promise<void>;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

function StatusBadgeButton({
  row,
  onPress,
  testID,
}: {
  row: PaymentHistoryRowModel;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={row.statusAccessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.statusBadge,
        row.isSuccessful ? styles.statusBadgeSuccess : styles.statusBadgeMuted,
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          row.isSuccessful ? styles.statusBadgeTextSuccess : styles.statusBadgeTextMuted,
        ]}
        numberOfLines={1}
      >
        {row.statusLabel}
      </Text>
    </TouchableOpacity>
  );
}

/** Preview / list compact row: plan · duration + amount; status on second line. */
function CompactPaymentRow({
  row,
  testIdPrefix,
  showDivider,
  onOpenDetails,
}: {
  row: PaymentHistoryRowModel;
  testIdPrefix: string;
  showDivider: boolean;
  onOpenDetails: (row: PaymentHistoryRowModel) => void;
}) {
  return (
    <Pressable
      style={[styles.rowWrap, showDivider && styles.rowDivider]}
      testID={`${testIdPrefix}-${row.id}`}
      onPress={() => onOpenDetails(row)}
      accessibilityRole="button"
      accessibilityLabel={row.previewAccessibilityLabel}
    >
      <View style={styles.primaryRow}>
        <Text style={styles.planText} numberOfLines={1} ellipsizeMode="tail">
          {row.planDurationLabel}
        </Text>
        <Text style={styles.amountText} numberOfLines={1}>
          {row.amountLabel}
        </Text>
      </View>
      <View style={styles.statusRow}>
        <StatusBadgeButton
          row={row}
          onPress={() => onOpenDetails(row)}
          testID={`${testIdPrefix}-status-${row.id}`}
        />
      </View>
    </Pressable>
  );
}

function PaymentHistoryRows({
  rows,
  testIdPrefix,
  onOpenDetails,
}: {
  rows: PaymentHistoryRowModel[];
  testIdPrefix: string;
  onOpenDetails: (row: PaymentHistoryRowModel) => void;
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
          onOpenDetails={onOpenDetails}
        />
      ))}
    </View>
  );
}

function PaymentDetailModal({
  visible,
  row,
  onClose,
  testID,
}: {
  visible: boolean;
  row: PaymentHistoryRowModel | null;
  onClose: () => void;
  testID: string;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxHeight = Math.round(windowHeight * 0.78);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      testID={`${testID}-detail-modal`}
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Закрыть детали оплаты"
        />
        <View
          style={[
            styles.detailSheet,
            {
              maxHeight: sheetMaxHeight,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Детали оплаты</Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Закрыть"
              testID={`${testID}-detail-close`}
            >
              <Ionicons name="close" size={22} color="#657065" />
            </TouchableOpacity>
          </View>

          {row ? (
            <ScrollView
              style={styles.detailScroll}
              contentContainerStyle={styles.detailScrollContent}
              showsVerticalScrollIndicator
              bounces={false}
            >
              {row.detailFields.map((field) => (
                <View
                  key={field.key}
                  style={styles.detailRow}
                  testID={`${testID}-detail-field-${field.key}`}
                >
                  <Text style={styles.detailLabel}>{field.label}</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      field.tone === 'spent' && styles.pointsSpent,
                      field.tone === 'earned' && styles.pointsEarned,
                    ]}
                  >
                    {field.value}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function PaymentHistoryFullModal({
  visible,
  onClose,
  onOpenDetails,
  model,
  refreshing,
  onRefresh,
  error,
  onRetry,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenDetails: (row: PaymentHistoryRowModel) => void;
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

  const renderItem: ListRenderItem<PaymentHistoryModalListItem> = useCallback(
    ({ item, index }) => {
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
          onOpenDetails={onOpenDetails}
        />
      );
    },
    [model.modalListItems, onOpenDetails, testID]
  );

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
 * Секция «История оплат»: превью до 3 записей + полный список + детали платежа.
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
  const [listVisible, setListVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [modalRefreshing, setModalRefreshing] = useState(false);

  const model = useMemo(
    () => buildPaymentHistorySectionModel(items, { loading, error }),
    [items, loading, error]
  );

  const selectedRow = selectedRowId ? model.rowsById[selectedRowId] ?? null : null;

  const handleOpenList = useCallback(() => {
    setListVisible(true);
    analytics.track(AnalyticsEvent.PaymentHistoryOpened, { screen: 'subscriptions' });
  }, []);

  const handleCloseList = useCallback(() => {
    // Nested: if details open, Back should close details first (handled in detail modal).
    // Closing the list while details are open also closes details.
    setDetailVisible(false);
    setSelectedRowId(null);
    setListVisible(false);
  }, []);

  const handleOpenDetails = useCallback((row: PaymentHistoryRowModel) => {
    setSelectedRowId(row.id);
    setDetailVisible(true);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setDetailVisible(false);
    setSelectedRowId(null);
  }, []);

  const handleListBack = useCallback(() => {
    const action = resolvePaymentHistoryBackAction({
      detailVisible,
      listVisible: true,
    });
    if (action === 'close-detail') {
      handleCloseDetails();
      return;
    }
    handleCloseList();
  }, [detailVisible, handleCloseDetails, handleCloseList]);

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
          <PaymentHistoryRows
            rows={model.preview}
            testIdPrefix="payment-history-preview"
            onOpenDetails={handleOpenDetails}
          />
        ) : null}

        {!model.loading && !model.error && model.showAllButton ? (
          <TouchableOpacity
            testID={`${testID}-show-all`}
            style={styles.showAllButton}
            onPress={handleOpenList}
            accessibilityRole="button"
            accessibilityLabel={model.showAllButtonLabel}
          >
            <Text style={styles.showAllButtonText}>{model.showAllButtonLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </Card>

      <PaymentHistoryFullModal
        visible={listVisible}
        onClose={handleListBack}
        onOpenDetails={handleOpenDetails}
        model={model}
        refreshing={modalRefreshing}
        onRefresh={onRefresh || onRetry ? handleModalRefresh : undefined}
        error={error}
        onRetry={onRetry}
        testID={testID}
      />

      <PaymentDetailModal
        visible={detailVisible}
        row={selectedRow}
        onClose={handleCloseDetails}
        testID={testID}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sectionCard: {},
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
    gap: 10,
  },
  planText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '700',
    color: semanticRoles.textPrimary,
  },
  amountText: {
    flexShrink: 0,
    fontSize: 14,
    fontWeight: '800',
    color: semanticRoles.textPrimary,
  },
  statusRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  statusBadgeSuccess: {
    backgroundColor: '#E8F5E9',
  },
  statusBadgeMuted: {
    backgroundColor: '#F3F4F6',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadgeTextSuccess: {
    color: '#1B5E20',
  },
  statusBadgeTextMuted: {
    color: '#4B5563',
  },
  pointsSpent: {
    color: semanticRoles.metricNegative,
    fontWeight: '700',
  },
  pointsEarned: {
    color: semanticRoles.metricPositive,
    fontWeight: '700',
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
  detailSheet: {
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
  detailScroll: {
    flexGrow: 0,
  },
  detailScrollContent: {
    paddingBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: semanticRoles.borderSubtle,
  },
  detailLabel: {
    flexShrink: 0,
    width: 140,
    fontSize: 13,
    color: semanticRoles.textMuted,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: semanticRoles.textPrimary,
    textAlign: 'right',
  },
});
