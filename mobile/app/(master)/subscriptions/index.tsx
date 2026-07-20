import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  AppState,
  AppStateStatus,
  Platform,
  Alert,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@src/auth/AuthContext';
import { useTabBarHeight } from '@src/contexts/TabBarHeightContext';
import { BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT } from '@src/constants/bottomNavLayout';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { Card } from '@src/components/Card';
import { StatusBadge } from '@src/components/StatusBadge';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { SecondaryButton } from '@src/components/SecondaryButton';
import {
  fetchCurrentSubscription,
  Subscription,
  SubscriptionType,
  SubscriptionStatus,
  getStatusLabel,
  getStatusColor,
  isExpiringSoon,
  getDisplayDaysRemaining,
} from '@src/services/api/subscriptions';
import { getBalance, type Balance } from '@src/services/api/master';
import {
  getSubscriptionPaymentHistory,
  type SubscriptionPaymentHistoryItem,
} from '@src/services/api/payments';
import { SubscriptionPurchaseModal } from '@src/components/subscriptions/SubscriptionPurchaseModal';
import { SubscriptionPaymentHistorySection } from '@src/components/subscriptions/SubscriptionPaymentHistorySection';
import { formatMoney } from '@src/utils/money';
import { getPlanTitle } from '@src/utils/planTitle';
import { refreshMasterFeaturesGlobally } from '@src/utils/masterFeaturesRefresh';
import {
  applyMasterPromoCode,
  getCurrentMasterPromoCode,
  getMasterReferralCode,
  getSubscriptionPoints,
  type CurrentMasterPromoCodeResponse,
  type MasterReferralCodeResponse,
  type SubscriptionPointsLedgerItem,
  type SubscriptionPointsResponse,
} from '@src/services/api/promoEngine';
import {
  formatSubscriptionPointsAmount,
  getCurrentPromoStatusLabel,
  getCurrentPromoCodeValue,
  getCurrentPromoStatusValue,
  getPromoAlreadyAppliedInlineMessage,
  getPromoErrorMessage,
  getSubscriptionPointsHistoryTitle,
  isPromoAlreadyAppliedError,
} from '@src/utils/promoEngine';
import {
  getMasterTariffComparisonRows,
  splitTariffComparisonColumns,
} from 'shared/subscriptionPlanFeatures';
import {
  analytics,
  AnalyticsEvent,
  verifyPendingSubscriptionPayment,
} from '@src/services/analytics';

const SCROLL_EXTRA_BOTTOM = 24;
const KEYBOARD_SCROLL_EXTRA_BOTTOM = 48;
/** Единый вертикальный gap между основными секциями экрана «Подписки». */
const SECTION_GAP = 16;
type PromoApplyMessageTone = 'success' | 'neutral';

/** Доступные средства (без резерва под подписку). */
function getAvailableBalanceAmount(balance: Balance | null): number {
  if (!balance) return 0;
  if (typeof balance.available_balance === 'number' && Number.isFinite(balance.available_balance)) {
    return balance.available_balance;
  }
  if (typeof balance.balance === 'number' && Number.isFinite(balance.balance)) {
    return balance.balance;
  }
  return 0;
}

/** Актуальный резерв — только из GET /api/balance/ (не price/spent snapshot подписки). */
function getReservedAmount(balance: Balance | null, subscription: Subscription | null): number {
  if (balance) {
    const fromBalance = balance.reserved_total ?? balance.reserved_balance;
    if (typeof fromBalance === 'number' && Number.isFinite(fromBalance)) {
      return fromBalance;
    }
  }
  const subReserved = subscription?.reserved_amount;
  if (typeof subReserved === 'number' && Number.isFinite(subReserved)) {
    return subReserved;
  }
  return 0;
}

function getTotalBalanceAmount(balance: Balance | null): number | null {
  if (!balance || typeof balance.balance !== 'number' || !Number.isFinite(balance.balance)) {
    return null;
  }
  return balance.balance;
}

export default function SubscriptionsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { tabBarHeight } = useTabBarHeight();
  const measuredTabBarHeight =
    typeof tabBarHeight === 'number' && tabBarHeight > 0
      ? tabBarHeight
      : BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT;
  const scrollPaddingBottom = insets.bottom + measuredTabBarHeight + SCROLL_EXTRA_BOTTOM;
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardScrollPaddingBottom = keyboardVisible
    ? scrollPaddingBottom + KEYBOARD_SCROLL_EXTRA_BOTTOM
    : scrollPaddingBottom;
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoLoadError, setPromoLoadError] = useState<string | null>(null);
  const [referralCodeData, setReferralCodeData] = useState<MasterReferralCodeResponse | null>(null);
  const [currentPromo, setCurrentPromo] = useState<CurrentMasterPromoCodeResponse | null>(null);
  const [subscriptionPoints, setSubscriptionPoints] = useState<SubscriptionPointsResponse | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [promoApplyLoading, setPromoApplyLoading] = useState(false);
  const [promoApplyMessage, setPromoApplyMessage] = useState<string | null>(null);
  const [promoApplyMessageTone, setPromoApplyMessageTone] = useState<PromoApplyMessageTone>('success');
  const [promoApplyError, setPromoApplyError] = useState<string | null>(null);
  const [promoStateVersion, setPromoStateVersion] = useState(0);
  const [paymentHistory, setPaymentHistory] = useState<SubscriptionPaymentHistoryItem[]>([]);
  const [paymentHistoryLoading, setPaymentHistoryLoading] = useState(false);
  const [paymentHistoryError, setPaymentHistoryError] = useState<string | null>(null);

  // Определяем тип подписки на основе роли пользователя
  const subscriptionType = user?.role === 'salon' 
    ? SubscriptionType.SALON 
    : user?.role === 'master' || user?.role === 'indie'
    ? SubscriptionType.MASTER
    : null;

  const loadSubscription = async () => {
    try {
      setError(null);

      const [currentSub, balanceData] = await Promise.all([
        fetchCurrentSubscription(),
        getBalance().catch(() => null),
      ]);
      setSubscription(currentSub);
      setBalance(balanceData);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } }; message?: string };
      const errorMessage =
        ax?.response?.data?.detail || ax?.message || 'Ошибка загрузки подписки';
      setError(typeof errorMessage === 'string' ? errorMessage : 'Ошибка загрузки подписки');
      console.error('Error loading subscription:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadPaymentHistory = async () => {
    if (subscriptionType !== SubscriptionType.MASTER) return;
    setPaymentHistoryLoading(true);
    setPaymentHistoryError(null);
    try {
      const data = await getSubscriptionPaymentHistory();
      setPaymentHistory(Array.isArray(data) ? data : []);
    } catch {
      setPaymentHistory([]);
      setPaymentHistoryError('Не удалось загрузить историю оплат');
    } finally {
      setPaymentHistoryLoading(false);
    }
  };

  const loadPromoData = async () => {
    if (subscriptionType !== SubscriptionType.MASTER) return;
    setPromoLoading(true);
    setPromoLoadError(null);
    try {
      const [referralResult, currentResult, pointsResult] = await Promise.allSettled([
        getMasterReferralCode(),
        getCurrentMasterPromoCode(),
        getSubscriptionPoints(),
      ]);

      if (referralResult.status === 'fulfilled') setReferralCodeData(referralResult.value);
      if (currentResult.status === 'fulfilled') {
        setCurrentPromo(currentResult.value);
        setPromoStateVersion((v) => v + 1);
      }
      if (pointsResult.status === 'fulfilled') setSubscriptionPoints(pointsResult.value);

      if (
        referralResult.status === 'rejected' ||
        currentResult.status === 'rejected' ||
        pointsResult.status === 'rejected'
      ) {
        setPromoLoadError('Не удалось загрузить часть данных промокодов. Потяните экран вниз, чтобы обновить.');
      }
    } catch {
      setPromoLoadError('Не удалось загрузить данные промокодов. Потяните экран вниз, чтобы обновить.');
    } finally {
      setPromoLoading(false);
    }
  };

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadSubscription(),
        loadPromoData(),
        loadPaymentHistory(),
        refreshMasterFeaturesGlobally(user?.id),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    analytics.track(AnalyticsEvent.SubscriptionScreenOpened, { screen: 'subscriptions' });
    loadSubscription();
    loadPromoData();
    loadPaymentHistory();
    void verifyPendingSubscriptionPayment({ source: 'subscriptions_mount' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // После возврата из внешней оплаты — проверить backend status, затем обновить UI
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void (async () => {
          await verifyPendingSubscriptionPayment({ source: 'app_state_active' });
          await refreshAll();
        })();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    refreshAll();
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}.${month}.${year}`;
  };

  const formatOptionalDate = (dateString?: string | null): string | null => {
    if (!dateString) return null;
    try {
      return formatDate(dateString);
    } catch {
      return null;
    }
  };

  const getCurrentPromoCode = () => {
    return getCurrentPromoCodeValue(currentPromo);
  };

  const getPointsItems = (): SubscriptionPointsLedgerItem[] => {
    const items = subscriptionPoints?.items || subscriptionPoints?.ledger || subscriptionPoints?.history || [];
    return Array.isArray(items) ? items : [];
  };

  const handleCopyReferralCode = async () => {
    const code = referralCodeData?.code;
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      Alert.alert('Готово', 'Промокод скопирован');
    } catch {
      Alert.alert('Ошибка', 'Не удалось скопировать промокод');
    }
  };

  const handleApplyPromoCode = async () => {
    const code = promoCodeInput.trim().toUpperCase();
    if (!code) {
      setPromoApplyError('Введите промокод');
      setPromoApplyMessage(null);
      return;
    }
    setPromoApplyLoading(true);
    setPromoApplyError(null);
    setPromoApplyMessage(null);
    setPromoApplyMessageTone('success');
    analytics.track(AnalyticsEvent.PromoCodeApplyStarted, {
      hasPromo: true,
      screen: 'subscriptions',
    });
    try {
      await applyMasterPromoCode(code);
      setPromoCodeInput('');
      setPromoApplyMessage('Промокод применён. Бонус будет начислен после первой оплаты подписки.');
      setPromoApplyMessageTone('success');
      analytics.track(AnalyticsEvent.PromoCodeApplied, {
        hasPromo: true,
        screen: 'subscriptions',
      });
      await loadPromoData();
    } catch (err: unknown) {
      analytics.track(AnalyticsEvent.PromoCodeFailed, {
        hasPromo: true,
        screen: 'subscriptions',
        errorType: isPromoAlreadyAppliedError(err) ? 'already_applied' : 'apply_failed',
      });
      if (isPromoAlreadyAppliedError(err)) {
        try {
          const refreshedCurrentPromo = await getCurrentMasterPromoCode();
          setCurrentPromo(refreshedCurrentPromo);
          setPromoStateVersion((v) => v + 1);
          const refreshedCode = getCurrentPromoCodeValue(refreshedCurrentPromo);
          if (refreshedCode) {
            setPromoApplyMessage(getPromoAlreadyAppliedInlineMessage(refreshedCode));
            setPromoApplyMessageTone('neutral');
            setPromoApplyError(null);
            getSubscriptionPoints().then(setSubscriptionPoints).catch(() => undefined);
            return;
          }
        } catch {
          // Expected business case: keep it as inline neutral UI, not a red error.
        }
        setPromoApplyMessage(getPromoAlreadyAppliedInlineMessage(null));
        setPromoApplyMessageTone('neutral');
        setPromoApplyError(null);
        return;
      }
      setPromoApplyError(getPromoErrorMessage(err));
    } finally {
      setPromoApplyLoading(false);
    }
  };

  const renderSubscriptionInfo = () => {
    if (!subscription) return null;

    const statusColor = getStatusColor(subscription.status as SubscriptionStatus);
    const statusLabel = getStatusLabel(subscription.status as SubscriptionStatus);
    const daysRemaining = getDisplayDaysRemaining(subscription);
    const expiringSoon = isExpiringSoon(subscription.end_date, 7);

    const planName = subscription.plan_name || 'Free';
    const isAlwaysFree = planName === 'AlwaysFree';
    const availableBalance = getAvailableBalanceAmount(balance);
    const reservedAmount = getReservedAmount(balance, subscription);
    const totalBalance = getTotalBalanceAmount(balance);
    const tariffRows = getMasterTariffComparisonRows(
      {
        name: planName,
        features: subscription.features || {},
        limits: subscription.limits || {},
      },
      isAlwaysFree
    );
    const { left: tariffLeftCol, right: tariffRightCol } = splitTariffComparisonColumns(tariffRows);

    const renderTariffRow = (row: { key: string; label: string; available: boolean }) => (
      <View key={row.key} style={styles.featureRow}>
        <Ionicons
          name={row.available ? 'checkmark-circle' : 'close-circle'}
          size={20}
          color={row.available ? '#4CAF50' : '#F44336'}
          style={styles.featureIcon}
        />
        <Text
          style={[
            styles.featureLabel,
            Platform.OS === 'ios' && styles.featureLabelIOS,
            !row.available && styles.featureLabelMuted,
          ]}
        >
          {row.label}
        </Text>
      </View>
    );

    return (
      <Card style={[styles.subscriptionCard, styles.sectionSpacing]}>
        <View style={styles.subscriptionHeader}>
          <View style={styles.subscriptionHeaderLeft}>
            <Text style={styles.planName}>
              {getPlanTitle(subscription) || 'Базовый план'}
            </Text>
            <Text style={styles.subscriptionType}>
              {subscription.subscription_type === SubscriptionType.SALON ? 'Салон' : 'Мастер'}
            </Text>
          </View>
          <StatusBadge label={statusLabel} color={statusColor} />
        </View>

        <View style={styles.subscriptionDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Действует до:</Text>
            <Text style={[styles.detailValue, expiringSoon && styles.expiringSoon]}>
              {formatDate(subscription.end_date)}
            </Text>
          </View>
          
          {daysRemaining > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Осталось дней:</Text>
              <Text style={[styles.detailValue, expiringSoon && styles.expiringSoon]}>
                {daysRemaining} {daysRemaining === 1 ? 'день' : daysRemaining < 5 ? 'дня' : 'дней'}
              </Text>
            </View>
          )}

          {subscription.plan_id && (
            <>
              {totalBalance != null ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Баланс на счёте:</Text>
                  <Text style={styles.detailValue}>{formatMoney(totalBalance)}</Text>
                </View>
              ) : null}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Свободный баланс:</Text>
                <Text style={styles.detailValue}>{formatMoney(availableBalance)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Зарезервировано:</Text>
                <Text style={styles.detailValue}>{formatMoney(reservedAmount)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Списание в день:</Text>
                <Text style={styles.detailValue}>{formatMoney(subscription.daily_rate || 0)}</Text>
              </View>
            </>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Автопродление:</Text>
            <Text style={styles.detailValue}>
              {subscription.auto_renewal ? 'Скоро (нужна привязка карты)' : 'Выключено'}
            </Text>
          </View>
        </View>

        {/* Лимиты подписки */}
        {(subscription.salon_branches > 0 || subscription.salon_employees > 0 || subscription.master_bookings > 0) && (
          <View style={styles.limitsContainer}>
            <Text style={styles.limitsTitle}>Лимиты:</Text>
            {subscription.subscription_type === SubscriptionType.SALON && (
              <>
                {subscription.salon_branches > 0 && (
                  <Text style={styles.limitItem}>
                    Филиалов: {subscription.salon_branches}
                  </Text>
                )}
                {subscription.salon_employees > 0 && (
                  <Text style={styles.limitItem}>
                    Сотрудников: {subscription.salon_employees}
                  </Text>
                )}
              </>
            )}
            {subscription.subscription_type === SubscriptionType.MASTER && subscription.master_bookings > 0 && (
              <Text style={styles.limitItem}>
                Бронирований: {subscription.master_bookings}
              </Text>
            )}
          </View>
        )}

        <View style={styles.featuresContainer}>
          <Text style={styles.featuresTitle}>Доступные функции</Text>
          <View style={styles.featureGrid}>
            <View style={[styles.featureColumn, styles.featureColumnLeft]}>{tariffLeftCol.map(renderTariffRow)}</View>
            <View style={[styles.featureColumn, styles.featureColumnRight]}>{tariffRightCol.map(renderTariffRow)}</View>
          </View>
        </View>
      </Card>
    );
  };

  const renderTariffControls = () => {
    if (!subscriptionType) return null;
    return (
      <Card style={[styles.controlsCard, styles.sectionSpacing]}>
        <Text style={styles.controlsTitle}>Тарифный план</Text>
        <Text style={styles.controlsText}>
          Управляйте тарифом и периодом. Автопродление по карте будет добавлено позже.
        </Text>
        <PrimaryButton
          title="Управление тарифом"
          onPress={openPurchaseModal}
        />
      </Card>
    );
  };

  const renderPromoCards = () => {
    if (subscriptionType !== SubscriptionType.MASTER) return null;

    const referralCode = referralCodeData?.code || null;
    const appliedPromoCode = getCurrentPromoCode();
    const currentPromoStatus = getCurrentPromoStatusLabel(getCurrentPromoStatusValue(currentPromo));
    const pointsItems = getPointsItems();
    const pointsBalance = formatSubscriptionPointsAmount(subscriptionPoints?.balance);

    return (
      <>
        <Card style={[styles.promoCard, styles.sectionSpacing]}>
          <View style={styles.promoCardHeader}>
            <View style={styles.promoCardHeaderText}>
              <Text style={styles.promoCardTitle}>Ваш промокод</Text>
              <Text style={styles.promoCardDescription}>
                Поделитесь кодом с другим мастером. После его первой оплаты от 3 месяцев вы оба получите бонусные баллы.
              </Text>
            </View>
            {promoLoading ? <ActivityIndicator size="small" color="#4CAF50" /> : null}
          </View>

          <View style={styles.referralCodeBox}>
            <Text style={styles.referralCodeLabel}>Личный код</Text>
            <Text style={styles.referralCodeValue} selectable>
              {referralCode || '—'}
            </Text>
          </View>

          <TouchableOpacity
            testID="copy-referral-code-button"
            style={[styles.promoSecondaryButton, !referralCode && styles.promoButtonDisabled]}
            onPress={handleCopyReferralCode}
            disabled={!referralCode}
          >
            <Text style={styles.promoSecondaryButtonText}>Скопировать</Text>
          </TouchableOpacity>

          {promoLoadError ? <Text style={styles.promoWarningText}>{promoLoadError}</Text> : null}
        </Card>

        <Card style={[styles.promoCard, styles.sectionSpacing]}>
          <Text style={styles.promoCardTitle}>Введите промокод</Text>
          <Text style={styles.promoCardDescription}>
            Бонусные баллы начислятся после первой успешной оплаты подписки.
          </Text>

          {appliedPromoCode ? (
            <View testID="current-promo-state" style={styles.currentPromoBox}>
              <Text style={styles.currentPromoTitle}>Промокод применён: {appliedPromoCode}</Text>
              {currentPromoStatus ? <Text style={styles.currentPromoText}>{currentPromoStatus}</Text> : null}
              <Text style={styles.currentPromoText}>Бонус будет начислен после первой оплаты.</Text>
            </View>
          ) : null}

          <View style={[styles.promoApplyForm, appliedPromoCode && styles.promoApplyFormWithCurrent]}>
            <TextInput
              testID="apply-promo-code-input"
              style={styles.promoInput}
              value={promoCodeInput}
              onChangeText={(text) => {
                setPromoCodeInput(text.trim().toUpperCase());
                if (promoApplyError) setPromoApplyError(null);
                if (promoApplyMessage) setPromoApplyMessage(null);
              }}
              placeholder="Введите промокод"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!promoApplyLoading}
            />
            <TouchableOpacity
              testID="apply-promo-code-button"
              style={[styles.promoPrimaryButton, promoApplyLoading && styles.promoButtonDisabled]}
              onPress={handleApplyPromoCode}
              disabled={promoApplyLoading}
            >
              {promoApplyLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.promoPrimaryButtonText}>Применить</Text>
              )}
            </TouchableOpacity>
          </View>

          {promoApplyMessage ? (
            <Text
              style={[
                styles.promoApplyMessageText,
                promoApplyMessageTone === 'neutral'
                  ? styles.promoApplyMessageTextNeutral
                  : styles.promoApplyMessageTextSuccess,
              ]}
            >
              {promoApplyMessage}
            </Text>
          ) : null}
          {promoApplyError ? <Text testID="promo-apply-error" style={styles.promoErrorText}>{promoApplyError}</Text> : null}
        </Card>

        <Card style={[styles.promoCard, styles.sectionSpacing]}>
          <View style={styles.pointsHeader}>
            <View style={styles.pointsHeaderText}>
              <Text style={styles.promoCardTitle}>Бонусные баллы</Text>
              <Text style={styles.promoCardDescription}>
                Бонусные баллы можно будет использовать для оплаты подписки. Это не клиентская лояльность и не денежный баланс.
              </Text>
            </View>
            <View style={styles.pointsBalanceBox}>
              <Text style={styles.pointsBalanceLabel}>Баланс</Text>
              <Text style={styles.pointsBalanceValue}>{pointsBalance}</Text>
            </View>
          </View>

          {pointsItems.length === 0 ? (
            <Text testID="subscription-points-empty" style={styles.pointsEmptyText}>Пока нет начислений</Text>
          ) : (
            <View style={styles.pointsHistoryList}>
              {pointsItems.map((item, index) => {
                const date = formatOptionalDate(item.created_at);
                const status = item.status || item.direction;
                return (
                  <View key={String(item.id ?? index)} style={styles.pointsHistoryItem}>
                    <View style={styles.pointsHistoryMain}>
                      <Text style={styles.pointsHistoryTitle}>{getSubscriptionPointsHistoryTitle(item)}</Text>
                      <Text style={styles.pointsHistoryMeta}>
                        {[date, status].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Text style={styles.pointsHistoryAmount}>
                      +{formatSubscriptionPointsAmount(item.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Card>
      </>
    );
  };

  const renderPaymentHistory = () => {
    if (subscriptionType !== SubscriptionType.MASTER) return null;
    return (
      <SubscriptionPaymentHistorySection
        items={paymentHistory}
        loading={paymentHistoryLoading}
        error={paymentHistoryError}
        onRetry={loadPaymentHistory}
        onRefresh={loadPaymentHistory}
        style={styles.sectionSpacing}
      />
    );
  };

  const renderInactiveSubscription = () => (
    <>
      <Card style={[styles.inactiveCard, styles.sectionSpacing]}>
        <Text style={styles.emptyTitle}>Подписка не активна</Text>
        <Text style={styles.emptyText}>
          Вы можете выбрать тариф и активировать подписку с баланса или пополнить баланс.
        </Text>
        {balance != null ? (
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>Свободный баланс:</Text>
            <Text style={styles.balanceValue}>
              {formatMoney(getAvailableBalanceAmount(balance))}
            </Text>
          </View>
        ) : null}
      </Card>

      {subscriptionType ? (
        <Card style={[styles.controlsCard, styles.sectionSpacing]}>
          <PrimaryButton
            title="Выбрать тариф"
            onPress={openPurchaseModal}
          />
          <View style={styles.secondaryActionWrap}>
            <SecondaryButton title="Обновить" onPress={handleRefresh} />
          </View>
        </Card>
      ) : (
        <View style={[styles.secondaryActionWrap, styles.sectionSpacing]}>
          <SecondaryButton title="Обновить" onPress={handleRefresh} />
        </View>
      )}
    </>
  );

  const openPurchaseModal = async () => {
    if (subscriptionType === SubscriptionType.MASTER) {
      try {
        const refreshedCurrentPromo = await getCurrentMasterPromoCode();
        setCurrentPromo(refreshedCurrentPromo);
        setPromoStateVersion((v) => v + 1);
      } catch {
        // Открытие тарифов не блокируем: calculate сам вернёт promo_preview, если backend видит pending promo.
      }
    }
    setPurchaseModalVisible(true);
  };

  const renderPurchaseModal = () =>
    subscriptionType ? (
      <SubscriptionPurchaseModal
        visible={purchaseModalVisible}
        onClose={() => setPurchaseModalVisible(false)}
        subscriptionType={subscriptionType}
        currentSubscription={subscription}
        onRefreshAfterPayment={refreshAll}
        promoStateVersion={promoStateVersion}
      />
    ) : null;

  if (loading) {
    return (
      <ScreenContainer compactTop>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Загрузка подписки...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer
        compactTop
        scrollable
        scrollViewProps={{
          contentContainerStyle: { paddingBottom: scrollPaddingBottom },
          showsVerticalScrollIndicator: true,
        }}
      >
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Ошибка</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton title="Повторить" onPress={loadSubscription} />
        </View>
      </ScreenContainer>
    );
  }

  if (!subscription) {
    return (
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScreenContainer
          compactTop
          scrollable
          scrollViewProps={{
            contentContainerStyle: { paddingBottom: keyboardScrollPaddingBottom },
            showsVerticalScrollIndicator: true,
            keyboardShouldPersistTaps: 'always',
            keyboardDismissMode: 'none',
            refreshControl: (
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#4CAF50']} />
            ),
          }}
        >
          {renderInactiveSubscription()}
          {renderPromoCards()}
          {renderPaymentHistory()}
          {renderPurchaseModal()}
        </ScreenContainer>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoiding}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenContainer
        compactTop
        scrollable
        scrollViewProps={{
          contentContainerStyle: { paddingBottom: keyboardScrollPaddingBottom },
          showsVerticalScrollIndicator: true,
          refreshControl: (
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#4CAF50']} />
          ),
          keyboardShouldPersistTaps: 'always',
          keyboardDismissMode: 'none',
        }}
      >
        {renderSubscriptionInfo()}
        {renderTariffControls()}
        {renderPromoCards()}
        {renderPaymentHistory()}

        {renderPurchaseModal()}
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F44336',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'left',
    marginBottom: 16,
    lineHeight: 20,
  },
  inactiveCard: {},
  sectionSpacing: {
    marginBottom: SECTION_GAP,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  balanceValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '700',
  },
  secondaryActionWrap: {
    marginTop: 12,
  },
  subscriptionCard: {},
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  subscriptionHeaderLeft: {
    flex: 1,
  },
  planName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subscriptionType: {
    fontSize: 14,
    color: '#666',
  },
  subscriptionDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 16,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  expiringSoon: {
    color: '#FF9800',
    fontWeight: 'bold',
  },
  limitsContainer: {
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  limitsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  limitItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  featuresContainer: {
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  featureGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  featureColumn: {
    flex: 1,
    minWidth: 0,
  },
  featureColumnLeft: {
    paddingRight: 8,
  },
  featureColumnRight: {
    paddingLeft: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  featureIcon: {
    marginTop: 1,
  },
  featureLabel: {
    flex: 1,
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
  },
  /** На iOS колонки уже — «Безлимитные записи» помещается в одну строку без смены сетки */
  featureLabelIOS: {
    fontSize: 13,
  },
  featureLabelMuted: {
    color: '#757575',
    fontWeight: '400',
  },
  plansSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  planCard: {
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  planCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  planCardPrice: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  purchaseButton: {
    marginTop: 8,
  },
  controlsCard: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  controlsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  controlsText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  promoCard: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  promoCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  promoCardHeaderText: {
    flex: 1,
  },
  promoCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  promoCardDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 12,
  },
  referralCodeBox: {
    borderWidth: 1,
    borderColor: '#C8E6C9',
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    padding: 12,
    marginBottom: 12,
  },
  referralCodeLabel: {
    fontSize: 11,
    color: '#2E7D32',
    fontWeight: '700',
    marginBottom: 4,
  },
  referralCodeValue: {
    fontSize: 20,
    color: '#1B5E20',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  promoPrimaryButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 112,
  },
  promoPrimaryButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  promoSecondaryButton: {
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  promoSecondaryButtonText: {
    color: '#4CAF50',
    fontWeight: '800',
    fontSize: 14,
  },
  promoButtonDisabled: {
    opacity: 0.55,
  },
  promoWarningText: {
    marginTop: 10,
    color: '#92400E',
    fontSize: 12,
    lineHeight: 17,
  },
  promoApplyForm: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  promoApplyFormWithCurrent: {
    marginTop: 12,
  },
  promoInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#2D2D2D',
    backgroundColor: '#fff',
  },
  currentPromoBox: {
    borderWidth: 1,
    borderColor: '#C8E6C9',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 12,
  },
  currentPromoTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1B5E20',
    marginBottom: 4,
  },
  currentPromoText: {
    fontSize: 13,
    color: '#2E7D32',
    lineHeight: 18,
  },
  promoApplyMessageText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  promoApplyMessageTextSuccess: {
    color: '#2E7D32',
  },
  promoApplyMessageTextNeutral: {
    color: '#92400E',
  },
  promoErrorText: {
    marginTop: 10,
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  pointsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  pointsHeaderText: {
    flex: 1,
  },
  pointsBalanceBox: {
    borderWidth: 1,
    borderColor: '#C8E6C9',
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 92,
    alignItems: 'center',
  },
  pointsBalanceLabel: {
    fontSize: 11,
    color: '#2E7D32',
    fontWeight: '700',
    marginBottom: 2,
  },
  pointsBalanceValue: {
    fontSize: 18,
    color: '#1B5E20',
    fontWeight: '900',
  },
  pointsEmptyText: {
    marginTop: 4,
    color: '#777',
    fontSize: 13,
    fontWeight: '600',
  },
  pointsHistoryList: {
    gap: 8,
  },
  pointsHistoryItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderRadius: 12,
    padding: 10,
  },
  pointsHistoryMain: {
    flex: 1,
  },
  pointsHistoryTitle: {
    color: '#333',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 3,
  },
  pointsHistoryMeta: {
    color: '#777',
    fontSize: 11,
    fontWeight: '600',
  },
  pointsHistoryAmount: {
    color: '#2E7D32',
    fontSize: 13,
    fontWeight: '900',
  },
});
