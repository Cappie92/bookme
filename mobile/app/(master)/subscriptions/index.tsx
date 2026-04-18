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
import { useAuth } from '@src/auth/AuthContext';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { Card } from '@src/components/Card';
import { StatusBadge } from '@src/components/StatusBadge';
import { PrimaryButton } from '@src/components/PrimaryButton';
import {
  fetchCurrentSubscription,
  Subscription,
  SubscriptionType,
  SubscriptionStatus,
  getStatusLabel,
  getStatusColor,
  isExpiringSoon,
  getDaysRemaining,
} from '@src/services/api/subscriptions';
import { SubscriptionPurchaseModal } from '@src/components/subscriptions/SubscriptionPurchaseModal';
import { formatMoney } from '@src/utils/money';
import { getPlanTitle } from '@src/utils/planTitle';
import { useMasterFeatures } from '@src/hooks/useMasterFeatures';
import {
  getMasterTariffComparisonRows,
  splitTariffComparisonColumns,
} from 'shared/subscriptionPlanFeatures';

/** Экран под Stack header «Подписки»: не дублировать top safe area (он уже учтён навигацией) и уменьшить зазор до первой карточки. */
const SUBSCRIPTIONS_SCROLL_CONTENT_STYLE = {
  paddingHorizontal: 16,
  paddingTop: 8,
  paddingBottom: 90,
  flexGrow: 1,
} as const;

export default function SubscriptionsScreen() {
  const { user } = useAuth();
  const { refresh: refreshMasterFeatures } = useMasterFeatures();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
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

      const currentSub = await fetchCurrentSubscription();
      setSubscription(currentSub);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка загрузки подписки';
      setError(errorMessage);
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
        refreshMasterFeatures(),
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
    const daysRemaining = getDaysRemaining(subscription.end_date);
    const expiringSoon = isExpiringSoon(subscription.end_date, 7);

    const planName = subscription.plan_name || 'Free';
    const isAlwaysFree = planName === 'AlwaysFree';
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
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Заморожено:</Text>
                <Text style={styles.detailValue}>{formatMoney(subscription.reserved_amount || 0)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Списание в день:</Text>
                <Text style={styles.detailValue}>{formatMoney(subscription.daily_rate || 0)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Израсходовано:</Text>
                <Text style={styles.detailValue}>{formatMoney(subscription.spent_amount || 0)}</Text>
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
      <ScreenContainer compactTop scrollable scrollViewProps={{ contentContainerStyle: SUBSCRIPTIONS_SCROLL_CONTENT_STYLE }}>
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
      <ScreenContainer compactTop scrollable scrollViewProps={{ contentContainerStyle: SUBSCRIPTIONS_SCROLL_CONTENT_STYLE }}>
        <View style={styles.centerContainer}>
          <Text style={styles.emptyTitle}>Подписка не активна</Text>
          <Text style={styles.emptyText}>
            У вас нет активной подписки. Обратитесь к администратору для активации.
          </Text>
          <PrimaryButton title="Обновить" onPress={handleRefresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      compactTop
      scrollable
      scrollViewProps={{
        contentContainerStyle: SUBSCRIPTIONS_SCROLL_CONTENT_STYLE,
        refreshControl: (
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#4CAF50']} />
        ),
        nestedScrollEnabled: true,
        keyboardShouldPersistTaps: 'handled',
        directionalLockEnabled: true,
      }}
    >
      {renderSubscriptionInfo()}
      {renderTariffControls()}

      {subscriptionType ? (
      <SubscriptionPurchaseModal
        visible={purchaseModalVisible}
        onClose={() => setPurchaseModalVisible(false)}
        subscriptionType={subscriptionType}
        currentSubscription={subscription}
        onRefreshAfterPayment={refreshAll}
      />
      ) : null}
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
    textAlign: 'center',
    marginBottom: 20,
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
