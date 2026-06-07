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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { SubscriptionPurchaseModal } from '@src/components/subscriptions/SubscriptionPurchaseModal';
import { formatMoney } from '@src/utils/money';
import { getPlanTitle } from '@src/utils/planTitle';
import { refreshMasterFeaturesGlobally } from '@src/utils/masterFeaturesRefresh';
import {
  getMasterTariffComparisonRows,
  splitTariffComparisonColumns,
} from 'shared/subscriptionPlanFeatures';

const SCROLL_EXTRA_BOTTOM = 24;

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
  const measuredTabBarHeight = tabBarHeight > 0 ? tabBarHeight : BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT;
  const scrollPaddingBottom = insets.bottom + measuredTabBarHeight + SCROLL_EXTRA_BOTTOM;
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [purchaseModalVisible, setPurchaseModalVisible] = useState(false);

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

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadSubscription(),
        refreshMasterFeaturesGlobally(user?.id),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSubscription();
  }, []);

  // После возврата из внешней оплаты (Linking/WebBrowser) приложение становится active — форс-обновляем подписку
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        refreshAll();
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
      <Card style={styles.subscriptionCard}>
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
      <Card style={styles.controlsCard}>
        <Text style={styles.controlsTitle}>Тарифный план</Text>
        <Text style={styles.controlsText}>
          Управляйте тарифом и периодом. Автопродление по карте будет добавлено позже.
        </Text>
        <PrimaryButton
          title="Управление тарифом"
          onPress={() => setPurchaseModalVisible(true)}
        />
      </Card>
    );
  };

  const renderInactiveSubscription = () => (
    <>
      <Card style={styles.inactiveCard}>
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
        <Card style={styles.controlsCard}>
          <PrimaryButton
            title="Выбрать тариф"
            onPress={() => setPurchaseModalVisible(true)}
          />
          <View style={styles.secondaryActionWrap}>
            <SecondaryButton title="Обновить" onPress={handleRefresh} />
          </View>
        </Card>
      ) : (
        <View style={styles.secondaryActionWrap}>
          <SecondaryButton title="Обновить" onPress={handleRefresh} />
        </View>
      )}
    </>
  );

  const renderPurchaseModal = () =>
    subscriptionType ? (
      <SubscriptionPurchaseModal
        visible={purchaseModalVisible}
        onClose={() => setPurchaseModalVisible(false)}
        subscriptionType={subscriptionType}
        currentSubscription={subscription}
        onRefreshAfterPayment={refreshAll}
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
      <ScreenContainer
        compactTop
        scrollable
        scrollViewProps={{
          contentContainerStyle: { paddingBottom: scrollPaddingBottom },
          showsVerticalScrollIndicator: true,
          refreshControl: (
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#4CAF50']} />
          ),
        }}
      >
        {renderInactiveSubscription()}
        {renderPurchaseModal()}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      compactTop
      scrollable
      scrollViewProps={{
        contentContainerStyle: { paddingBottom: scrollPaddingBottom },
        showsVerticalScrollIndicator: true,
        refreshControl: (
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#4CAF50']} />
        ),
        keyboardShouldPersistTaps: 'handled',
      }}
    >
      {renderSubscriptionInfo()}
      {renderTariffControls()}

      {renderPurchaseModal()}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
  inactiveCard: {
    marginBottom: 16,
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
  subscriptionCard: {
    marginBottom: 16,
  },
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
    marginTop: 8,
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
});
