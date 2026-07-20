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
  Dimensions,
  TextInput,
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
  fetchPricingCatalog,
  type PricingCatalogServiceFunction,
  calculateSubscription,
  deleteSubscriptionCalculationSnapshot,
  SubscriptionCalculationResponse,
  applyUpgradeFree,
  applyUpgradeBalance,
} from '@src/services/api/subscriptions';
import { initSubscriptionPayment } from '@src/services/api/payments';
import {
  analytics,
  AnalyticsEvent,
  savePendingSubscriptionPayment,
  verifyPendingSubscriptionPayment,
} from '@src/services/analytics';
import { getPlanTitle } from '@src/utils/planTitle';
import {
  getPlanPeriodSavings,
  type SubscriptionDurationMonths,
} from '@src/utils/subscriptionPeriodSavings';
import { env } from '@src/config/env';
import {
  sanitizePaymentRedirectUrl,
  shouldPaySubscriptionFromBalance,
  resolveCardPortion,
} from '@src/utils/subscriptionPayment';
import {
  getPeriodStepSubscriptionPurchasePromoPreviewDisplay,
} from '@src/utils/subscriptionPurchasePromoPreview';
import { getPromoPreviewDisplay } from '@src/utils/promoEngine';
import { getSubscriptionPlanFeatureLabels } from '@src/utils/subscriptionPlanFeatures';

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

function StepMessage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.center}>
      <Text style={styles.messageTitle}>{title}</Text>
      {subtitle ? <Text style={styles.messageSubtitle}>{subtitle}</Text> : null}
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

function PromoPreviewBlock({
  display,
  testID,
}: {
  display: ReturnType<typeof getPromoPreviewDisplay>;
  testID: string;
}) {
  if (!display) return null;
  return (
    <View
      testID={testID}
      style={[
        styles.promoPreviewCard,
        display.tone === 'positive'
          ? styles.promoPreviewCardPositive
          : styles.promoPreviewCardNeutral,
      ]}
    >
      <Text
        style={[
          styles.promoPreviewTitle,
          display.tone === 'positive'
            ? styles.promoPreviewTitlePositive
            : styles.promoPreviewTitleNeutral,
        ]}
      >
        Промокод
      </Text>
      <Text
        style={[
          styles.promoPreviewMessage,
          display.tone === 'positive'
            ? styles.promoPreviewMessagePositive
            : styles.promoPreviewMessageNeutral,
        ]}
      >
        {display.message}
      </Text>
      <Text style={styles.promoPreviewHelper}>{display.helper}</Text>
    </View>
  );
}

function StepPlan({
  plans,
  serviceFunctions,
  selectedPlanId,
  currentPlanId,
  onSelectPlan,
}: {
  plans: SubscriptionPlan[];
  serviceFunctions: PricingCatalogServiceFunction[];
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
          const features = getSubscriptionPlanFeatureLabels(plan, serviceFunctions);
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
                  {features.length > 0 ? (
                    <View style={styles.planFeaturesList}>
                      {features.map((feature) => (
                        <Text key={feature} style={styles.planFeatureText}>
                          • {feature}
                        </Text>
                      ))}
                    </View>
                  ) : null}
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

const BRAND_GREEN = '#4CAF50';

function SubscriptionPointsControls({
  calculation,
  useSubscriptionPoints,
  subscriptionPointsToUse,
  onToggleUsePoints,
  onChangePointsToUse,
}: {
  calculation: SubscriptionCalculationResponse | null;
  useSubscriptionPoints: boolean;
  subscriptionPointsToUse: number;
  onToggleUsePoints: (enabled: boolean) => void;
  onChangePointsToUse: (value: number) => void;
}) {
  if (!calculation || typeof calculation.subscription_points_available !== 'number') {
    return null;
  }
  if (Number(calculation.subscription_points_available) <= 0) {
    return null;
  }

  const priceBefore = Math.floor(
    Number(calculation.price_before_points ?? calculation.total_price ?? 0)
  );
  const available = Math.max(0, Number(calculation.subscription_points_available ?? 0));
  const maxPoints = Math.min(available, priceBefore);

  return (
    <View style={styles.pointsCard} testID="subscription-points-controls">
      <View style={styles.tableRow}>
        <Text style={styles.tableKey}>Баллы</Text>
        <Text style={styles.tableVal} testID="subscription-points-available">
          {available}
        </Text>
      </View>
      <View style={styles.switchRowCompact}>
        <Text style={styles.switchLabel}>Использовать баллы</Text>
        <Switch
          value={useSubscriptionPoints}
          onValueChange={onToggleUsePoints}
          trackColor={{ false: '#D1D5DB', true: BRAND_GREEN }}
          thumbColor="#FFFFFF"
          ios_backgroundColor="#D1D5DB"
          testID="subscription-use-points-toggle"
        />
      </View>
      {useSubscriptionPoints ? (
        <>
          <Text style={styles.pointsHint}>1 балл = 1 ₽</Text>
          <TextInput
            value={String(subscriptionPointsToUse)}
            onChangeText={(text) => {
              const raw = Number(text.replace(/[^\d]/g, ''));
              if (Number.isNaN(raw)) {
                onChangePointsToUse(0);
                return;
              }
              onChangePointsToUse(Math.max(0, Math.min(maxPoints, Math.floor(raw))));
            }}
            keyboardType="number-pad"
            style={styles.pointsInput}
            testID="subscription-points-input"
          />
        </>
      ) : null}
    </View>
  );
}

function SubscriptionPointsBreakdown({
  calculation,
}: {
  calculation: SubscriptionCalculationResponse | null;
}) {
  if (!calculation || !Number(calculation.subscription_points_used)) return null;
  return (
    <>
      <View style={styles.tableRow}>
        <Text style={styles.tableKey}>Цена до баллов</Text>
        <Text style={styles.tableVal} testID="subscription-price-before-points">
          {formatMoney(calculation.price_before_points ?? calculation.total_price)}
        </Text>
      </View>
      <View style={styles.tableRow}>
        <Text style={styles.tableKey}>Списать баллов</Text>
        <Text style={styles.tableVal} testID="subscription-points-used">
          −{calculation.subscription_points_used}
        </Text>
      </View>
    </>
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
  loadingCalculation,
  calculation,
  useSubscriptionPoints,
  subscriptionPointsToUse,
  onToggleUsePoints,
  onChangePointsToUse,
}: {
  selectedPlan: SubscriptionPlan | null;
  currentPlanLabel: string | null;
  selectedDuration: 1 | 3 | 6 | 12 | null;
  onSelectDuration: (months: 1 | 3 | 6 | 12) => void;
  showUpgradeType: boolean;
  upgradeType: UpgradeType;
  onChangeUpgradeType: (nextType: UpgradeType) => void;
  isDowngrade: boolean;
  loadingCalculation: boolean;
  calculation: SubscriptionCalculationResponse | null;
  useSubscriptionPoints: boolean;
  subscriptionPointsToUse: number;
  onToggleUsePoints: (enabled: boolean) => void;
  onChangePointsToUse: (value: number) => void;
}) {
  const selectedSavings =
    selectedPlan && selectedDuration
      ? getPlanPeriodSavings(selectedPlan, selectedDuration)
      : null;
  const promoPreview = getPeriodStepSubscriptionPurchasePromoPreviewDisplay(calculation);

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
          const periodSavings =
            selectedPlan != null ? getPlanPeriodSavings(selectedPlan, m as SubscriptionDurationMonths) : null;
          return (
            <Pressable
              key={m}
              onPress={() => onSelectDuration(m)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{m} мес</Text>
              {periodSavings ? (
                <Text style={[styles.segmentSavings, active && styles.segmentSavingsActive]}>
                  −{periodSavings.savingsPercent}%
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {selectedDuration && selectedDuration > 1 ? (
        selectedSavings ? (
          <View style={styles.savingsBanner}>
            <Text style={styles.savingsBannerText}>
              Выгода за период: {formatMoney(selectedSavings.savingsRub)} · {selectedSavings.savingsPercent}%
            </Text>
          </View>
        ) : (
          <Text style={styles.hint}>Без скидки</Text>
        )
      ) : (
        <Text style={styles.hint}>Цена зависит от периода</Text>
      )}

      <View style={styles.periodCalculationCard}>
        <Text style={styles.periodCalculationTitle}>Расчет</Text>
        {loadingCalculation ? (
          <CalculationLoadingState />
        ) : calculation ? (
          <>
            <SubscriptionPointsControls
              calculation={calculation}
              useSubscriptionPoints={useSubscriptionPoints}
              subscriptionPointsToUse={subscriptionPointsToUse}
              onToggleUsePoints={onToggleUsePoints}
              onChangePointsToUse={onChangePointsToUse}
            />
            <SubscriptionPointsBreakdown calculation={calculation} />
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
            <PromoPreviewBlock
              display={promoPreview}
              testID="subscription-period-promo-preview"
            />
          </>
        ) : (
          <Text style={styles.muted}>Выберите тариф и период, чтобы увидеть расчет</Text>
        )}
      </View>

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
  payFromBalance,
}: {
  loadingCalculation: boolean;
  calculation: SubscriptionCalculationResponse | null;
  enableAutoRenewal: boolean;
  onToggleAutoRenewal: (next: boolean) => void;
  showPaidButton: boolean;
  onPaid: () => void;
  payFromBalance: boolean;
}) {
  const pointsPortion =
    typeof calculation?.points_portion === 'number'
      ? calculation.points_portion
      : Number(calculation?.subscription_points_used ?? 0) || 0;
  const balancePortion =
    typeof calculation?.balance_portion === 'number'
      ? calculation.balance_portion
      : payFromBalance
        ? Number(calculation?.final_price ?? 0)
        : 0;
  const cardPortion =
    typeof calculation?.card_portion === 'number'
      ? calculation.card_portion
      : payFromBalance
        ? 0
        : Number(calculation?.final_price ?? 0);

  return (
    <View>
      <Text style={styles.sectionLabel}>Расчет</Text>

      {loadingCalculation ? (
        <CalculationLoadingState />
      ) : calculation ? (
        <View>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={styles.tableKey}>Стоимость тарифа</Text>
              <Text style={styles.tableVal} numberOfLines={1}>
                {formatMoney(calculation.total_price)}
              </Text>
            </View>
            {pointsPortion > 0 ? (
              <View style={styles.tableRow}>
                <Text style={styles.tableKey}>Промобаллами</Text>
                <Text style={styles.tableVal} numberOfLines={1}>
                  {formatMoney(pointsPortion)}
                </Text>
              </View>
            ) : null}
            {balancePortion > 0.001 ? (
              <View style={styles.tableRow}>
                <Text style={styles.tableKey}>Со счета</Text>
                <Text style={styles.tableVal} numberOfLines={1}>
                  {formatMoney(balancePortion)}
                </Text>
              </View>
            ) : null}
            <View style={styles.tableRow}>
              <Text style={[styles.tableKey, styles.tableKeyStrong]}>К оплате картой</Text>
              <Text style={[styles.tableVal, styles.tableValStrong]} numberOfLines={1}>
                {formatMoney(cardPortion)}
              </Text>
            </View>
            {typeof calculation.available_balance === 'number' ? (
              <View style={styles.tableRow}>
                <Text style={styles.tableKey}>Доступный баланс</Text>
                <Text style={styles.tableVal} numberOfLines={1}>
                  {formatMoney(calculation.available_balance)}
                </Text>
              </View>
            ) : null}
            {payFromBalance || cardPortion <= 0.001 ? (
              <Text style={styles.balanceHintOk}>Оплата без перехода на карту</Text>
            ) : null}
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
              <Switch
                value={enableAutoRenewal}
                onValueChange={onToggleAutoRenewal}
                trackColor={{ false: '#D1D5DB', true: BRAND_GREEN }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#D1D5DB"
                style={styles.autoRenewalSwitch}
              />
            </View>
          </View>

          {calculation.breakdown_text ? (
            <Text style={styles.breakdownHint}>{calculation.breakdown_text}</Text>
          ) : null}

          {showPaidButton ? (
            <Pressable onPress={onPaid} style={({ pressed }) => [styles.paidButton, pressed && styles.pressed]}>
              <Text style={styles.paidButtonText}>Я оплатил — обновить</Text>
            </Pressable>
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
  promoStateVersion,
}: {
  visible: boolean;
  onClose: () => void;
  subscriptionType: SubscriptionType;
  currentSubscription: Subscription | null;
  onRefreshAfterPayment?: () => void;
  promoStateVersion?: number;
}) {
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = React.useState<SubscriptionPlan[]>([]);
  const [serviceFunctions, setServiceFunctions] = React.useState<PricingCatalogServiceFunction[]>([]);
  const [loadingPlans, setLoadingPlans] = React.useState(false);
  const [plansError, setPlansError] = React.useState<string | null>(null);

  const [step, setStep] = React.useState<Step>(1);
  const [selectedPlan, setSelectedPlan] = React.useState<SubscriptionPlan | null>(null);
  const [selectedDuration, setSelectedDuration] = React.useState<1 | 3 | 6 | 12 | null>(null);
  const [upgradeType, setUpgradeType] = React.useState<UpgradeType>('immediate');
  const [enableAutoRenewal, setEnableAutoRenewal] = React.useState(false);

  const [calculation, setCalculation] = React.useState<SubscriptionCalculationResponse | null>(null);
  const [loadingCalculation, setLoadingCalculation] = React.useState(false);
  const [loadingPayment, setLoadingPayment] = React.useState(false);
  const [paymentOpened, setPaymentOpened] = React.useState(false);
  const [useSubscriptionPoints, setUseSubscriptionPoints] = React.useState(false);
  const [subscriptionPointsToUse, setSubscriptionPointsToUse] = React.useState(0);
  const calculationRequestSeq = React.useRef(0);
  const calculationIdRef = React.useRef<number | null>(null);

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
    const calculationId = calculationIdRef.current;
    try {
      if (calculationId) {
        await deleteSubscriptionCalculationSnapshot(calculationId);
      }
    } catch {
      // ignore
    } finally {
      calculationRequestSeq.current += 1;
      calculationIdRef.current = null;
      setStep(1);
      setSelectedPlan(null);
      setSelectedDuration(null);
      setCalculation(null);
      setUpgradeType('immediate');
      setEnableAutoRenewal(false);
      setUseSubscriptionPoints(false);
      setSubscriptionPointsToUse(0);
      setLoadingCalculation(false);
      setLoadingPayment(false);
      setPaymentOpened(false);
      setPlansError(null);
    }
  }, []);

  React.useEffect(() => {
    if (!visible) return;
    setStep(1);
    (async () => {
      try {
        setLoadingPlans(true);
        setPlansError(null);
        let data: SubscriptionPlan[] = [];
        try {
          const catalog = await fetchPricingCatalog(subscriptionType);
          data = catalog.plans as SubscriptionPlan[];
          setServiceFunctions(Array.isArray(catalog.service_functions) ? catalog.service_functions : []);
        } catch {
          data = await fetchAvailableSubscriptions(subscriptionType);
          setServiceFunctions([]);
        }
        const filtered = data
          .filter((p) => p.name !== 'Free' && p.name !== 'AlwaysFree')
          .sort((a, b) => a.display_order - b.display_order);
        setPlans(filtered);
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || 'Не удалось загрузить тарифы';
        setPlansError(String(msg));
        setPlans([]);
        Alert.alert('Ошибка', String(msg));
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
    // При смене плана сбрасываем период и расчет, чтобы следующий шаг был чистым.
    if (selectedPlan && selectedPlan.id !== plan.id) {
      calculationRequestSeq.current += 1;
      const previousCalculationId = calculationIdRef.current;
      if (previousCalculationId) {
        deleteSubscriptionCalculationSnapshot(previousCalculationId).catch(() => undefined);
      }
      calculationIdRef.current = null;
      setCalculation(null);
      setSelectedDuration(null);
    }
    setSelectedPlan(plan);
    analytics.track(AnalyticsEvent.SubscriptionPlanSelected, {
      planMonths: selectedDuration ?? undefined,
      screen: 'subscription_purchase',
    });

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

  const handleDurationSelect = (months: 1 | 3 | 6 | 12) => {
    setSelectedDuration(months);
    analytics.track(AnalyticsEvent.SubscriptionPlanSelected, {
      planMonths: months,
      screen: 'subscription_purchase',
    });
  };

  const calculateSelectedSubscription = React.useCallback(async () => {
    if (!visible || !selectedPlan || !selectedDuration) return;
    const plan = selectedPlan;
    const duration = selectedDuration;
    const upgradeTypeToUse = upgradeType;
    const request = {
      plan_id: plan.id,
      duration_months: duration,
      upgrade_type: upgradeTypeToUse,
      subscription_points_to_use: useSubscriptionPoints ? Math.max(0, subscriptionPointsToUse) : 0,
    };
    const requestId = calculationRequestSeq.current + 1;
    calculationRequestSeq.current = requestId;
    const previousCalculationId = calculationIdRef.current;
    setCalculation(null);
    setLoadingCalculation(true);
    try {
      // best-effort cleanup предыдущего snapshot
      if (previousCalculationId) {
        deleteSubscriptionCalculationSnapshot(previousCalculationId).catch(() => undefined);
      }
      const data = await calculateSubscription(request);
      if (calculationRequestSeq.current === requestId) {
        calculationIdRef.current = data.calculation_id ?? null;
        setCalculation(data);
      }
    } catch (e: any) {
      if (calculationRequestSeq.current === requestId) {
        const errorText = String(e?.response?.data?.detail || e?.message || 'Не удалось рассчитать стоимость');
        Alert.alert('Ошибка', errorText);
        setCalculation(null);
      }
    } finally {
      if (calculationRequestSeq.current === requestId) {
        setLoadingCalculation(false);
      }
    }
  }, [visible, selectedPlan, selectedDuration, upgradeType, useSubscriptionPoints, subscriptionPointsToUse]);

  const handleToggleUseSubscriptionPoints = React.useCallback(
    (enabled: boolean) => {
      setUseSubscriptionPoints(enabled);
      if (enabled && calculation) {
        const priceBefore = Math.floor(
          Number(calculation.price_before_points ?? calculation.total_price ?? 0)
        );
        const available = Math.max(0, Number(calculation.subscription_points_available ?? 0));
        setSubscriptionPointsToUse(Math.min(available, priceBefore));
      } else {
        setSubscriptionPointsToUse(0);
      }
    },
    [calculation]
  );

  React.useEffect(() => {
    calculateSelectedSubscription();
  }, [calculateSelectedSubscription, promoStateVersion]);

  const handleUpgradeTypeChange = (nextType: UpgradeType) => {
    setUpgradeType(nextType);
  };

  const payFromBalance = React.useMemo(() => {
    if (!calculation) return false;
    return shouldPaySubscriptionFromBalance({
      finalPrice: calculation.final_price,
      availableBalance: calculation.available_balance,
      canPayFromBalance: calculation.can_pay_from_balance,
      cardPortion: calculation.card_portion,
      balancePortion: calculation.balance_portion,
      requiresRobokassa: calculation.requires_robokassa,
    });
  }, [calculation]);

  const handlePayment = async () => {
    if (!selectedPlan || !selectedDuration || !calculation) return;

    if (Number(calculation.final_price) <= 0) {
      try {
        setLoadingPayment(true);
        await applyUpgradeFree(calculation.calculation_id);
        await onRefreshAfterPayment?.();
        await handleClose();
        Alert.alert('Готово', 'Тариф применён');
      } catch (e: any) {
        Alert.alert('Ошибка', e?.response?.data?.detail || 'Не удалось применить тариф');
      } finally {
        setLoadingPayment(false);
      }
      return;
    }

    if (payFromBalance) {
      try {
        setLoadingPayment(true);
        const result = await applyUpgradeBalance(
          calculation.calculation_id,
          enableAutoRenewal
        );
        await onRefreshAfterPayment?.();
        await handleClose();
        const msg = result.already_applied
          ? 'Тариф уже был применён ранее'
          : `Тариф активирован. Списано ${formatMoney(result.paid_from_balance ?? calculation.final_price)} с баланса.`;
        Alert.alert('Готово', msg);
      } catch (e: any) {
        const detail = e?.response?.data?.detail;
        const text =
          typeof detail === 'object' && detail?.message
            ? `${detail.message} (нужно ${formatMoney(detail.required)}, на балансе ${formatMoney(detail.available)})`
            : detail || 'Не удалось оплатить с баланса';
        Alert.alert('Ошибка', String(text));
      } finally {
        setLoadingPayment(false);
      }
      return;
    }

    try {
      setLoadingPayment(true);
      const payment = await initSubscriptionPayment({
        plan_id: selectedPlan.id,
        duration_months: selectedDuration,
        payment_period: 'month',
        upgrade_type: upgradeType,
        calculation_id: calculation.calculation_id,
        enable_auto_renewal: enableAutoRenewal,
        payment_source: 'mobile_app',
      });

      if (payment && payment.requires_payment === false) {
        const cardFromInit = Number(payment.card_portion);
        const balanceFromInit = Number(payment.balance_portion);
        const useBalance =
          (Number.isFinite(balanceFromInit) && balanceFromInit > 0.001 &&
            (!Number.isFinite(cardFromInit) || cardFromInit <= 0.001)) ||
          (Number(calculation.final_price) > 0 &&
            Number.isFinite(cardFromInit) &&
            cardFromInit <= 0.001 &&
            Number.isFinite(balanceFromInit) &&
            balanceFromInit > 0.001);

        Alert.alert(
          useBalance ? 'Оплата с баланса' : 'Оплата не требуется',
          payment.message ||
            (useBalance ? 'Можно оплатить с внутреннего баланса' : 'Доплата не требуется'),
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
                  if (useBalance) {
                    const result = await applyUpgradeBalance(
                      calculation.calculation_id,
                      enableAutoRenewal
                    );
                    await onRefreshAfterPayment?.();
                    await handleClose();
                    Alert.alert(
                      'Готово',
                      result.already_applied
                        ? 'Тариф уже был применён ранее'
                        : `Тариф активирован. Списано ${formatMoney(result.paid_from_balance ?? calculation.final_price)} с баланса.`
                    );
                  } else {
                    await applyUpgradeFree(calculation.calculation_id);
                    await onRefreshAfterPayment?.();
                    await handleClose();
                  }
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
      const rawUrl = payment?.payment_url;
      if (!rawUrl) {
        Alert.alert('Ошибка', 'Не удалось получить ссылку на оплату');
        return;
      }
      const paymentUrl = sanitizePaymentRedirectUrl(rawUrl, env.WEB_URL, __DEV__);
      const canOpen = await Linking.canOpenURL(paymentUrl);
      if (!canOpen) {
        Alert.alert('Ошибка', 'Не удалось открыть страницу оплаты');
        return;
      }
      if (__DEV__) {
        try {
          const u = new URL(paymentUrl);
          const domain = `${u.protocol}//${u.host}${u.pathname}`;
          console.log('🧾 [PAYMENT] Opening payment_url', { domain, origin: u.origin });
        } catch (e) {
          console.log('🧾 [PAYMENT] Opening payment_url (parse failed)', payment.payment_url?.slice(0, 80));
        }
      }
      await Linking.openURL(paymentUrl);
      setPaymentOpened(true);
      const publicId = typeof payment?.payment === 'string' ? payment.payment : '';
      const cash = resolveCardPortion({
        finalPrice: Number(calculation.final_price) || 0,
        cardPortion: calculation.card_portion,
        payFromBalance: false,
      });
      const full = Number(calculation.price_before_points ?? calculation.total_price ?? calculation.final_price) || cash;
      const pointsUsed = Number(calculation.subscription_points_used ?? calculation.points_portion ?? 0) || 0;
      if (publicId) {
        await savePendingSubscriptionPayment({
          publicId,
          planMonths: selectedDuration,
          planFullAmount: full,
          cashPaidAmount: cash,
          pointsUsed,
          currency: 'RUB',
          startedAt: new Date().toISOString(),
          hasPromo: Boolean(calculation.promo_preview),
        });
      }
      analytics.track(AnalyticsEvent.SubscriptionPaymentStarted, {
        paymentId: publicId || undefined,
        planMonths: selectedDuration,
        paymentStatus: 'pending',
        usedPoints: pointsUsed > 0,
        hasPromo: Boolean(calculation.promo_preview),
        platform: 'mobile',
      });
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
  const canGoNextFromStep2 = !!selectedPlan && !!selectedDuration && !!calculation && !loadingCalculation;
  const canPay =
    !!selectedPlan &&
    !!selectedDuration &&
    !!calculation &&
    !loadingCalculation &&
    !loadingPayment;

  const paymentCtaLabel = React.useMemo(() => {
    if (loadingPayment) return 'Подождите…';
    if (!calculation) return 'Оплатить';
    if (calculation.final_price <= 0) return 'Применить тариф';
    if (payFromBalance) return 'Оплатить';
    const card = resolveCardPortion({
      finalPrice: calculation.final_price,
      cardPortion: calculation.card_portion,
      payFromBalance: false,
    });
    if (card > 0.001) return `Оплатить ${formatMoney(card)}`;
    return 'Оплатить';
  }, [loadingPayment, calculation, payFromBalance]);

  const sheetMaxHeight = Math.round(Dimensions.get('window').height * 0.88);
  const footerPaddingBottom = 12 + Math.max(insets.bottom, 0);
  /** Фиксированная высота «хрома» sheet (header + шаги + footer), чтобы ScrollView не схлопывался на Android. */
  const sheetChromeHeight = 52 + 48 + 64 + footerPaddingBottom;
  const scrollMaxHeight = Math.max(160, sheetMaxHeight - sheetChromeHeight);

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
    if (plansError) {
      return (
        <StepMessage
          title="Не удалось загрузить тарифы"
          subtitle={plansError}
        />
      );
    }
    if (step === 1) {
      if (plans.length === 0) {
        return (
          <StepMessage
            title="Нет доступных тарифов"
            subtitle="Попробуйте обновить позже или обратитесь в поддержку."
          />
        );
      }
      return (
        <StepPlan
          plans={plans}
          serviceFunctions={serviceFunctions}
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
          loadingCalculation={loadingCalculation}
          calculation={calculation}
          useSubscriptionPoints={useSubscriptionPoints}
          subscriptionPointsToUse={subscriptionPointsToUse}
          onToggleUsePoints={handleToggleUseSubscriptionPoints}
          onChangePointsToUse={setSubscriptionPointsToUse}
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
        payFromBalance={payFromBalance}
        onPaid={async () => {
          try {
            await verifyPendingSubscriptionPayment({ source: 'paid_button' });
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

        <View style={[styles.sheet, { height: sheetMaxHeight, maxHeight: sheetMaxHeight }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Управление тарифом</Text>
            <Pressable onPress={handleClose} style={styles.closeButton} hitSlop={8}>
              <Ionicons name="close" size={24} color="#666" />
            </Pressable>
          </View>

          <StepIndicator step={step} total={totalSteps} />

          <ScrollView
            style={[styles.scroll, { maxHeight: scrollMaxHeight }]}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
            bounces
          >
            {stepContent()}
          </ScrollView>

          {/* Sticky footer */}
          <View style={[styles.footer, { paddingBottom: footerPaddingBottom }]}>
            <View style={styles.footerRow}>
              <Pressable
                onPress={goBackOrClose}
                style={({ pressed }) => [styles.footerSecondary, pressed && styles.pressed]}
              >
                <Text style={styles.footerSecondaryText}>{step === 1 ? 'Закрыть' : 'Назад'}</Text>
              </Pressable>

              {step < totalSteps ? (
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
                  <Text style={styles.footerPrimaryText}>{paymentCtaLabel}</Text>
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
    overflow: 'hidden',
    flexDirection: 'column',
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
    flexGrow: 0,
    flexShrink: 1,
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
  },
  messageTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    marginBottom: 8,
  },
  messageSubtitle: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  balanceHintOk: {
    marginTop: 6,
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '700',
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
  planFeaturesList: {
    marginTop: 8,
    gap: 3,
  },
  planFeatureText: {
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
    lineHeight: 17,
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
  periodCalculationCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  periodCalculationTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111',
    marginBottom: 10,
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
  segmentSavings: {
    marginTop: 2,
    fontSize: 10,
    color: '#666',
    fontWeight: '700',
  },
  segmentSavingsActive: {
    color: '#2E7D32',
  },
  savingsBanner: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  savingsBannerText: {
    fontSize: 13,
    color: '#1B5E20',
    fontWeight: '800',
    textAlign: 'center',
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
  pointsCard: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
  },
  pointsHint: {
    marginTop: 6,
    marginBottom: 6,
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  pointsInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
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
  promoPreviewCard: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  promoPreviewCardPositive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#C8E6C9',
  },
  promoPreviewCardNeutral: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  promoPreviewTitle: {
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
  },
  promoPreviewTitlePositive: {
    color: '#1B5E20',
  },
  promoPreviewTitleNeutral: {
    color: '#92400E',
  },
  promoPreviewMessage: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  promoPreviewMessagePositive: {
    color: '#1B5E20',
  },
  promoPreviewMessageNeutral: {
    color: '#92400E',
  },
  promoPreviewHelper: {
    marginTop: 6,
    fontSize: 12,
    color: '#555',
    fontWeight: '600',
    lineHeight: 17,
  },
  switchRowCompact: {
    marginTop: 10,
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  autoRenewalSwitch: {
    transform: [{ scaleX: 1.08 }, { scaleY: 1.08 }],
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


