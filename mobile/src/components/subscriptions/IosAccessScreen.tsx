import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@src/components/Card';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { StatusBadge } from '@src/components/StatusBadge';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { useTabBarHeight } from '@src/contexts/TabBarHeightContext';
import { BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT } from '@src/constants/bottomNavLayout';
import {
  fetchSubscriptionAccessSummary,
  getStatusColor,
  getStatusLabel,
  SubscriptionStatus,
} from '@src/services/api/subscriptions';
import {
  IOS_ACCESS_LOADING,
  loadIosAccessState,
  type IosAccessState,
} from '@src/utils/iosAccessState';
import { getPlanTitle } from '@src/utils/planTitle';

const FEATURE_LABELS = [
  ['has_booking_page', 'Публичная страница записи'],
  ['has_clients_access', 'Работа с клиентами'],
  ['has_extended_stats', 'Расширенная статистика'],
  ['has_loyalty_access', 'Программа лояльности'],
  ['has_finance_access', 'Финансы'],
  ['has_client_restrictions', 'Правила и ограничения клиентов'],
  ['can_customize_domain', 'Персональный адрес страницы'],
] as const;

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toLocaleDateString('ru-RU');
}

function readyStatus(state: Exclude<IosAccessState, { kind: 'LOADING' | 'ERROR' }>) {
  if (state.kind === 'READY_FREE') {
    return { label: 'Бесплатный доступ', color: '#4CAF50' };
  }
  if (state.kind === 'READY_ALWAYS_FREE') {
    return { label: 'Постоянный доступ', color: '#4CAF50' };
  }
  return {
    label: getStatusLabel(state.summary.status as SubscriptionStatus),
    color: getStatusColor(state.summary.status as SubscriptionStatus),
  };
}

export function IosAccessScreen() {
  const insets = useSafeAreaInsets();
  const { tabBarHeight } = useTabBarHeight();
  const bottom = insets.bottom + (tabBarHeight || BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT) + 24;
  const [state, setState] = useState<IosAccessState>(IOS_ACCESS_LOADING);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setState(IOS_ACCESS_LOADING);
    const nextState = await loadIosAccessState(fetchSubscriptionAccessSummary);
    setState(nextState);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const ready = state.kind === 'READY_FREE'
    || state.kind === 'READY_PAID'
    || state.kind === 'READY_ALWAYS_FREE'
    ? state
    : null;
  const summary = ready?.summary ?? null;
  const planTitle = summary
    ? getPlanTitle({
        plan_display_name: summary.plan_display_name,
        plan_name: summary.plan_name,
      }) || summary.plan_name
    : null;
  const status = ready ? readyStatus(ready) : null;
  const activeFeatures = summary
    ? FEATURE_LABELS.filter(([key]) => summary.features[key] === true)
    : [];
  const endDate = ready?.kind === 'READY_PAID' ? formatDate(summary?.end_date) : null;

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        <Text style={styles.title}>Мой доступ</Text>
        <Text style={styles.subtitle}>Сведения о функциях, доступных вашему аккаунту</Text>

        {state.kind === 'LOADING' ? (
          <View style={styles.center} testID="ios-access-loading">
            <ActivityIndicator size="large" color="#4CAF50" />
          </View>
        ) : null}

        {state.kind === 'ERROR' ? (
          <Card style={styles.card} testID="ios-access-error">
            <Text style={styles.error}>{state.message}</Text>
            <Text style={styles.muted}>Повторите попытку, чтобы получить актуальные сведения.</Text>
            <SecondaryButton title="Повторить" onPress={() => void load()} style={styles.retryButton} />
          </Card>
        ) : null}

        {ready && summary && status ? (
          <>
            <Card style={styles.card} testID="ios-my-access-card">
              <View style={styles.row}>
                <View>
                  <Text style={styles.label}>Уровень доступа</Text>
                  <Text style={styles.plan}>{planTitle}</Text>
                </View>
                <StatusBadge label={status.label} color={status.color} />
              </View>
              {endDate ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Действует до</Text>
                  <Text style={styles.detailValue}>{endDate}</Text>
                </View>
              ) : null}
              <View style={styles.detailRow} testID="ios-access-booking-limit">
                <Text style={styles.detailLabel}>Активные будущие записи</Text>
                <Text style={styles.detailValue}>
                  {summary.is_unlimited || summary.max_future_bookings == null
                    ? `${summary.current_active_bookings} · без лимита`
                    : `${summary.current_active_bookings} / ${summary.max_future_bookings}`}
                </Text>
              </View>
              {ready.kind === 'READY_FREE' ? (
                <Text style={styles.limitHint}>Free включает до 20 активных будущих записей.</Text>
              ) : null}
            </Card>

            <Card style={styles.card}>
              <Text style={styles.sectionTitle}>Доступные функции</Text>
              {activeFeatures.length > 0 ? activeFeatures.map(([, label]) => (
                <View key={label} style={styles.featureRow}>
                  <Text style={styles.check}>✓</Text>
                  <Text style={styles.featureText}>{label}</Text>
                </View>
              )) : (
                <Text style={styles.muted}>Базовые функции сервиса</Text>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Модулей страницы</Text>
                <Text style={styles.detailValue}>{summary.features.max_page_modules}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Хранение статистики</Text>
                <Text style={styles.detailValue}>
                  {summary.features.stats_retention_days === 0
                    ? 'Без ограничения'
                    : `${summary.features.stats_retention_days} дней`}
                </Text>
              </View>
            </Card>

            <SecondaryButton title="Обновить данные" onPress={() => void load(true)} />
          </>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#222' },
  subtitle: { marginTop: 6, marginBottom: 18, color: '#666', fontSize: 14 },
  center: { paddingVertical: 48, alignItems: 'center' },
  error: { color: '#B3261E', marginBottom: 8, fontWeight: '600' },
  retryButton: { marginTop: 16 },
  card: { marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#777', fontSize: 13 },
  plan: { color: '#222', fontSize: 22, fontWeight: '700', marginTop: 3 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 12 },
  detailLabel: { color: '#666', flex: 1 },
  detailValue: { color: '#222', fontWeight: '600', textAlign: 'right' },
  limitHint: { color: '#666', fontSize: 13, marginTop: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#222', marginBottom: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 5 },
  check: { color: '#2E7D32', fontWeight: '700', marginRight: 9 },
  featureText: { color: '#333', flex: 1 },
  muted: { color: '#777' },
});
