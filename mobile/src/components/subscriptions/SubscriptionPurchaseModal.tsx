import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { formatMoney } from '@src/utils/money';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionType,
  fetchAvailableSubscriptions,
  calculateSubscription,
  deleteSubscriptionCalculationSnapshot,
  SubscriptionCalculationResponse,
  applyUpgradeFree,
} from '@src/services/api/subscriptions';
import { initSubscriptionPayment } from '@src/services/api/payments';
import { getPlanTitle } from '@src/utils/planTitle';

type UpgradeType = 'immediate' | 'after_expiry';

const DURATIONS: Array<1 | 3 | 6 | 12> = [1, 3, 6, 12];

type Step = 1 | 2 | 3;

function formatDateDDMMYY(dateString?: string | null): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function getMinMonthlyPrice(plan: SubscriptionPlan): number {
  return Math.min(plan.price_1month, plan.price_3months, plan.price_6months, plan.price_12months);
}

function getPlanDisplayName(plan: SubscriptionPlan): string {
  return plan.display_name || plan.name;
}

function isFreeLikePlan(planName?: string | null): boolean {
  return planName === 'Free' || planName === 'AlwaysFree';
}

function StepIndicator({ step, total }: { step: number; total: number }) {
  const progress = Math.max(0, Math.min(1, step / total));
  return (
    <View style={styles.stepBarWrap}>
      <Text style={styles.stepText}>Шаг {step}/{total}</Text>
      <View style={styles.stepBarTrack}>
        <View style={[styles.stepBarFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#4CAF50" />
      <Text style={styles.centerText}>{label}</Text>
    </View>
  );
}

function CalculationLoadingState() {
  return (
    <View style={styles.centerSmall}>
      <ActivityIndicator size="small" color="#4CAF50" />
      <Text style={styles.centerText}>Считаем…</Text>
    </View>
  );
}

function StepPlan({
  plans,
  selectedPlanId,
  currentPlanId,
  onSelectPlan,
}: {
  plans: SubscriptionPlan[];
  selectedPlanId: number | null;
  currentPlanId: number | null;
  onSelectPlan: (plan: SubscriptionPlan) => void;
}) {
  return (
    <View>
      <Text style={styles.sectionLabel}>Выбор тарифа</Text>
      <View style={styles.radioList}>
        {plans.map((plan) => {
          const isSelected = selectedPlanId === plan.id;
          const isCurrent = !!currentPlanId && plan.id === currentPlanId;
          const minPrice = getMinMonthlyPrice(plan);
          return (
            <Pressable
              key={plan.id}
              onPress={() => onSelectPlan(plan)}
              style={[styles.radioRow, isSelected && styles.radioRowSelected]}
            >
              <View style={styles.radioRowMain}>
                <View style={styles.radioRowText}>
                  <View style={styles.radioRowTitleLine}>
                    <Text style={styles.radioTitle} numberOfLines={1}>
                      {getPlanDisplayName(plan)}
                    </Text>
                    {isCurrent ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>Текущий</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.radioSub} numberOfLines={1}>
                    от {formatMoney(minPrice)} /мес
                  </Text>
                </View>
                <View style={[styles.radioMark, isSelected && styles.radioMarkSelected]}>
                  {isSelected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function StepPeriod({
  selectedPlan,
  currentPlanLabel,
  selectedDuration,
  onSelectDuration,
  showUpgradeType,
  upgradeType,
  onChangeUpgradeType,
  isDowngrade,
}: {
  selectedPlan: SubscriptionPlan | null;
  currentPlanLabel: string | null;
  selectedDuration: 1 | 3 | 6 | 12 | null;
  onSelectDuration: (months: 1 | 3 | 6 | 12) => void;
  showUpgradeType: boolean;
  upgradeType: UpgradeType;
  onChangeUpgradeType: (nextType: UpgradeType) => void;
  isDowngrade: boolean;
}) {
  return (
    <View>
      <Text style={styles.sectionLabel}>Период</Text>

      {selectedPlan ? (
        <View style={styles.selectedSummary}>
          <Text style={styles.selectedSummaryText} numberOfLines={1}>
            {getPlanDisplayName(selectedPlan)}
            {currentPlanLabel ? ` (сейчас: ${currentPlanLabel})` : ''}
          </Text>
        </View>
      ) : null}

      <View style={styles.segmented}>
        {DURATIONS.map((m) => {
          const active = selectedDuration === m;
          return (
            <Pressable
              key={m}
              onPress={() => onSelectDuration(m)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{m} мес</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>Цена зависит от периода</Text>

      {isDowngrade ? (
        <Text style={styles.breakdownHint}>
          Тариф будет применён после окончания текущей подписки
        </Text>
      ) : null}

      {showUpgradeType ? (
        <View style={styles.inlineCard}>
          <Text style={styles.inlineCardTitle}>Когда применить новый тариф?</Text>
          <View style={styles.inlineSegments}>
            <Pressable
              onPress={() => onChangeUpgradeType('immediate')}
              style={[styles.inlineSegment, upgradeType === 'immediate' && styles.inlineSegmentActive]}
            >
              <Text style={[styles.inlineSegmentText, upgradeType === 'immediate' && styles.inlineSegmentTextActive]}>
                Немедленно
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onChangeUpgradeType('after_expiry')}
              style={[styles.inlineSegment, upgradeType === 'after_expiry' && styles.inlineSegmentActive]}
            >
              <Text style={[styles.inlineSegmentText, upgradeType === 'after_expiry' && styles.inlineSegmentTextActive]}>
                После окончания
              </Text>
            </Pressable>
          </View>
          <Text style={styles.inlineCardHint} numberOfLines={1}>
            Можно изменить до оплаты
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function StepCheckout({
  loadingCalculation,
  calculation,
  enableAutoRenewal,
  onToggleAutoRenewal,
  showPaidButton,
  onPaid,
}: {
  loadingCalculation: boolean;
  calculation: SubscriptionCalculationResponse | null;
  enableAutoRenewal: boolean;
  onToggleAutoRenewal: (next: boolean) => void;
  showPaidButton: boolean;
  onPaid: () => void;
}) {
  return (
    <View>
      <Text style={styles.sectionLabel}>Расчет</Text>

      {loadingCalculation ? (
        <CalculationLoadingState />
      ) : calculation ? (
        <View>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={[styles.tableKey, styles.tableKeyStrong]}>К оплате</Text>
              <Text style={[styles.tableVal, styles.tableValStrong]} numberOfLines={1}>
                {formatMoney(calculation.final_price)}
              </Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableKey}>Стоимость</Text>
              <Text style={styles.tableVal} numberOfLines={1}>
                {formatMoney(calculation.total_price)}
              </Text>
            </View>
            {calculation.savings_percent ? (
              <View style={styles.tableRow}>
                <Text style={styles.tableKey}>Экономия</Text>
                <Text style={styles.tableVal}>{Math.round(calculation.savings_percent)}%</Text>
              </View>
            ) : null}
            <View style={styles.tableRow}>
              <Text style={styles.tableKey}>Период</Text>
              <Text style={styles.tableVal} numberOfLines={1}>
                {formatDateDDMMYY(calculation.start_date)} → {formatDateDDMMYY(calculation.end_date)}
              </Text>
            </View>

            <View style={styles.switchRowCompact}>
              <Text style={styles.switchLabel}>Автопродление</Text>
              <Switch value={enableAutoRenewal} onValueChange={onToggleAutoRenewal} />
            </View>
          </View>

          {'breakdown_text' in calculation && (calculation as any).breakdown_text ? (
            <Text style={styles.breakdownHint}>{(calculation as any).breakdown_text}</Text>
          ) : null}

          {showPaidButton ? (
            <Pressable onPress={onPaid} style={({ pressed }) => [styles.paidButton, pressed && styles.pressed]}>
              <Text style={styles.paidButtonText}>Я оплатил — обновить</Text>
            </Pressable>
          ) : null}

          {__DEV__ ? (
            <Text style={styles.debugJson} selectable>
              {JSON.stringify(
                {
                  upgrade_type: (calculation as any).upgrade_type,
                  total_price: (calculation as any).total_price,
                  final_price: (calculation as any).final_price,
                  current_plan_credit: (calculation as any).current_plan_credit,
                  current_plan_accrued: (calculation as any).current_plan_accrued,
                  current_plan_reserved_remaining: (calculation as any).current_plan_reserved_remaining,
                  credit_source: (calculation as any).credit_source,
                },
                null,
                2
              )}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.muted}>Выберите период, чтобы увидеть расчет</Text>
      )}
    </View>
  );
}

export function SubscriptionPurchaseModal({
  visible,
  onClose,
  subscriptionType,
  currentSubscription,
  onRefreshAfterPayment,
}: {
  visible: boolean;
  onClose: () => void;
  subscriptionType: SubscriptionType;
  currentSubscription: Subscription | null;
  onRefreshAfterPayment?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = React.useState<SubscriptionPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = React.useState(false);

  const [step, setStep] = React.useState<Step>(1);
  const [selectedPlan, setSelectedPlan] = React.useState<SubscriptionPlan | null>(null);
  const [selectedDuration, setSelectedDuration] = React.useState<1 | 3 | 6 | 12 | null>(null);
  const [upgradeType, setUpgradeType] = React.useState<UpgradeType>('immediate');
  const [enableAutoRenewal, setEnableAutoRenewal] = React.useState(false);

  const [calculation, setCalculation] = React.useState<SubscriptionCalculationResponse | null>(null);
  const [loadingCalculation, setLoadingCalculation] = React.useState(false);
  const [loadingPayment, setLoadingPayment] = React.useState(false);
  const [paymentOpened, setPaymentOpened] = React.useState(false);

  const isFreePlan =
    !currentSubscription?.plan_id ||
    isFreeLikePlan(currentSubscription?.plan_name);

  const currentPlanDisplayOrder = React.useMemo(() => {
    if (!currentSubscription?.plan_id) return null;
    const found = plans.find((p) => p.id === currentSubscription.plan_id);
    return typeof found?.display_order === 'number' ? found.display_order : null;
  }, [plans, currentSubscription?.plan_id]);

  const isUpgrade =
    !!currentPlanDisplayOrder && !!selectedPlan && selectedPlan.display_order > currentPlanDisplayOrder;

  const resetState = React.useCallback(async () => {
    try {
      if (calculation?.calculation_id) {
        await deleteSubscriptionCalculationSnapshot(calculation.calculation_id);
      }
    } catch {
      // ignore
    } finally {
      setStep(1);
      setSelectedPlan(null);
      setSelectedDuration(null);
      setCalculation(null);
      setUpgradeType('immediate');
      setEnableAutoRenewal(false);
      setLoadingCalculation(false);
      setLoadingPayment(false);
      setPaymentOpened(false);
    }
  }, [calculation?.calculation_id]);

  React.useEffect(() => {
    if (!visible) return;
    setStep(1);
    (async () => {
      try {
        setLoadingPlans(true);
        const data = await fetchAvailableSubscriptions(subscriptionType);
        const filtered = data
          .filter((p) => p.name !== 'Free' && p.name !== 'AlwaysFree')
          .sort((a, b) => a.display_order - b.display_order);
        setPlans(filtered);
      } catch (e) {
        Alert.alert('Ошибка', 'Не удалось загрузить тарифы');
      } finally {
        setLoadingPlans(false);
      }
    })();
  }, [visible, subscriptionType]);

  const handleClose = async () => {
    await resetState();
    onClose();
  };

  const handlePlanSelect = (plan: SubscriptionPlan) => {
    // При смене плана — сбрасываем расчет
    if (selectedPlan && selectedPlan.id !== plan.id) {
      if (calculation?.calculation_id) {
        deleteSubscriptionCalculationSnapshot(calculation.calculation_id).catch(() => undefined);
      }
      setCalculation(null);
      setSelectedDuration(null);
    }
    setSelectedPlan(plan);

    // Авто-логика upgradeType как в web
    if (isFreePlan) {
      setUpgradeType('immediate');
      return;
    }
    if (currentPlanDisplayOrder && plan.display_order < currentPlanDisplayOrder) {
      setUpgradeType('after_expiry');
    } else if (currentPlanDisplayOrder && plan.display_order === currentPlanDisplayOrder) {
      setUpgradeType('after_expiry');
    } else if (currentPlanDisplayOrder && plan.display_order > currentPlanDisplayOrder) {
      setUpgradeType('immediate');
    } else {
      setUpgradeType('immediate');
    }
  };

  const handleDurationSelect = async (
    months: 1 | 3 | 6 | 12,
    opts?: { upgradeTypeOverride?: UpgradeType }
  ) => {
    if (!selectedPlan) return;
    const upgradeTypeToUse = opts?.upgradeTypeOverride ?? upgradeType;
    setSelectedDuration(months);
    setLoadingCalculation(true);
    try {
      // best-effort cleanup предыдущего snapshot
      if (calculation?.calculation_id) {
        deleteSubscriptionCalculationSnapshot(calculation.calculation_id).catch(() => undefined);
      }
      const data = await calculateSubscription({
        plan_id: selectedPlan.id,
        duration_months: months,
        upgrade_type: upgradeTypeToUse,
      });
      setCalculation(data);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail || 'Не удалось рассчитать стоимость');
      setCalculation(null);
    } finally {
      setLoadingCalculation(false);
    }
  };

  const handleUpgradeTypeChange = async (nextType: UpgradeType) => {
    setUpgradeType(nextType);
    // Пересчитать, если уже выбран период
    if (selectedDuration) {
      await handleDurationSelect(selectedDuration, { upgradeTypeOverride: nextType });
    }
  };

  const handlePayment = async () => {
    if (!selectedPlan || !selectedDuration || !calculation) return;
    try {
      setLoadingPayment(true);
      const payment = await initSubscriptionPayment({
        plan_id: selectedPlan.id,
        duration_months: selectedDuration,
        payment_period: 'month',
        upgrade_type: upgradeType,
        calculation_id: calculation.calculation_id,
        enable_auto_renewal: enableAutoRenewal,
      });

      if (payment && (payment as any).requires_payment === false) {
        Alert.alert(
          'Оплата не требуется',
          (payment as any).message || 'Доплата не требуется',
          [
            {
              text: 'Отмена',
              style: 'cancel',
              onPress: () => {
                setPaymentOpened(false);
              },
            },
            {
              text: 'Применить',
              onPress: async () => {
                try {
                  if (!calculation?.calculation_id) return;
                  await applyUpgradeFree(calculation.calculation_id);
                  await onRefreshAfterPayment?.();
                  await handleClose();
                } catch (e: any) {
                  Alert.alert('Ошибка', e?.response?.data?.detail || 'Не удалось применить тариф');
                }
              },
            },
          ]
        );
        setPaymentOpened(false);
        return;
      }
      if (!payment?.payment_url) {
        Alert.alert('Ошибка', 'Не удалось получить ссылку на оплату');
        return;
      }
      const canOpen = await Linking.canOpenURL(payment.payment_url);
      if (!canOpen) {
        Alert.alert('Ошибка', 'Не удалось открыть страницу оплаты');
        return;
      }
      if (__DEV__) {
        try {
          const u = new URL(payment.payment_url);
          const domain = `${u.protocol}//${u.host}${u.pathname}`;
          console.log('🧾 [PAYMENT] Opening payment_url', { domain, origin: u.origin });
        } catch (e) {
          console.log('🧾 [PAYMENT] Opening payment_url (parse failed)', payment.payment_url?.slice(0, 80));
        }
      }
      await Linking.openURL(payment.payment_url);
      setPaymentOpened(true);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.detail || 'Не удалось инициализировать платеж');
    } finally {
      setLoadingPayment(false);
    }
  };

  const totalSteps = 3;
  const currentPlanId = currentSubscription?.plan_id ?? null;
  const currentPlanLabel = getPlanTitle(currentSubscription ?? undefined) || null;

  const canGoNextFromStep1 = !!selectedPlan;
  const canGoNextFromStep2 = !!selectedPlan && !!selectedDuration;
  const canPay =
    !!selectedPlan &&
    !!selectedDuration &&
    !!calculation &&
    (typeof calculation.final_price !== 'number' || calculation.final_price > 0) &&
    !loadingCalculation &&
    !loadingPayment;

  const goNext = () => {
    if (step === 1 && canGoNextFromStep1) setStep(2);
    else if (step === 2 && canGoNextFromStep2) setStep(3);
  };

  const goBackOrClose = async () => {
    if (step === 1) {
      await handleClose();
      return;
    }
    setStep((prev) => (prev === 3 ? 2 : 1));
  };

  const stepContent = () => {
    if (loadingPlans) return <LoadingState label="Загрузка тарифов…" />;
    if (step === 1) {
      return (
        <StepPlan
          plans={plans}
          selectedPlanId={selectedPlan?.id ?? null}
          currentPlanId={currentPlanId}
          onSelectPlan={handlePlanSelect}
        />
      );
    }
    if (step === 2) {
      return (
        <StepPeriod
          selectedPlan={selectedPlan}
          currentPlanLabel={currentPlanLabel}
          selectedDuration={selectedDuration}
          onSelectDuration={handleDurationSelect}
          showUpgradeType={isUpgrade && !isFreePlan}
          upgradeType={upgradeType}
          onChangeUpgradeType={handleUpgradeTypeChange}
          isDowngrade={!!currentPlanDisplayOrder && !!selectedPlan && selectedPlan.display_order < currentPlanDisplayOrder}
        />
      );
    }
    return (
      <StepCheckout
        loadingCalculation={loadingCalculation}
        calculation={calculation}
        enableAutoRenewal={enableAutoRenewal}
        onToggleAutoRenewal={setEnableAutoRenewal}
        showPaidButton={paymentOpened}
        onPaid={async () => {
          try {
            await onRefreshAfterPayment?.();
          } finally {
            await handleClose();
          }
        }}
      />
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Управление тарифом</Text>
            <Pressable onPress={handleClose} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <StepIndicator step={step} total={totalSteps} />

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {stepContent()}
          </ScrollView>

          {/* Sticky footer */}
          <View style={[styles.footer, { paddingBottom: 12 + Math.max(insets.bottom, 0) }]}>
            <View style={styles.footerRow}>
              <Pressable
                onPress={goBackOrClose}
                style={({ pressed }) => [styles.footerSecondary, pressed && styles.pressed]}
              >
                <Text style={styles.footerSecondaryText}>{step === 1 ? 'Закрыть' : 'Назад'}</Text>
              </Pressable>

              {step < 3 ? (
                <Pressable
                  onPress={goNext}
                  disabled={(step === 1 && !canGoNextFromStep1) || (step === 2 && !canGoNextFromStep2)}
                  style={({ pressed }) => [
                    styles.footerPrimary,
                    ((step === 1 && !canGoNextFromStep1) || (step === 2 && !canGoNextFromStep2)) && styles.footerPrimaryDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.footerPrimaryText}>Далее</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handlePayment}
                  disabled={!canPay}
                  style={({ pressed }) => [
                    styles.footerPrimary,
                    (!canPay) && styles.footerPrimaryDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.footerPrimaryText}>
                    {loadingPayment ? 'Переход…' : 'Перейти к оплате'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f4f4f4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBarWrap: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  stepText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginBottom: 6,
  },
  stepBarTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: '#eee',
    overflow: 'hidden',
  },
  stepBarFill: {
    height: 4,
    backgroundColor: '#4CAF50',
    borderRadius: 999,
  },
  scroll: {
    flexGrow: 1,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111',
    marginBottom: 10,
  },
  radioList: {
    gap: 8,
  },
  radioRow: {
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 14,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  radioRowSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  radioRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  radioRowText: {
    flex: 1,
  },
  radioRowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  radioTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111',
    flexShrink: 1,
  },
  radioSub: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  badgeText: {
    fontSize: 11,
    color: '#374151',
    fontWeight: '700',
  },
  radioMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#d6d6d6',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  radioMarkSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#4CAF50',
  },
  selectedSummary: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#EFEFEF',
    marginBottom: 10,
  },
  selectedSummaryText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
  },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#e6e6e6',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: '#E8F5E9',
  },
  segmentText: {
    fontSize: 13,
    color: '#444',
    fontWeight: '800',
  },
  segmentTextActive: {
    color: '#4CAF50',
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    color: '#777',
    fontWeight: '600',
  },
  inlineCard: {
    marginTop: 12,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#F3F7FF',
    borderWidth: 1,
    borderColor: '#DCEBFF',
  },
  inlineCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1f3b64',
    marginBottom: 8,
  },
  inlineSegments: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#DCEBFF',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  inlineSegment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineSegmentActive: {
    backgroundColor: '#E8F5E9',
  },
  inlineSegmentText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1f3b64',
  },
  inlineSegmentTextActive: {
    color: '#4CAF50',
  },
  inlineCardHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#5b6b84',
    fontWeight: '600',
  },
  breakdownHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  paidButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  paidButtonText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  debugJson: {
    marginTop: 8,
    fontSize: 10,
    color: '#888',
    fontWeight: '600',
  },
  table: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  tableKey: {
    fontSize: 12,
    color: '#666',
    fontWeight: '700',
  },
  tableVal: {
    fontSize: 12,
    color: '#111',
    fontWeight: '800',
  },
  tableKeyStrong: {
    fontSize: 13,
    color: '#111',
  },
  tableValStrong: {
    fontSize: 15,
    color: '#111',
  },
  switchRowCompact: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
  },
  center: {
    padding: 20,
    alignItems: 'center',
  },
  centerSmall: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  centerText: {
    marginTop: 10,
    color: '#666',
    fontWeight: '600',
  },
  muted: {
    color: '#777',
    fontWeight: '600',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e6e6e6',
    backgroundColor: '#fff',
    minWidth: 96,
    alignItems: 'center',
  },
  footerSecondaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#333',
  },
  footerPrimary: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerPrimaryDisabled: {
    backgroundColor: '#A5D6A7',
  },
  footerPrimaryText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#fff',
  },
  pressed: {
    opacity: 0.9,
  },
});


