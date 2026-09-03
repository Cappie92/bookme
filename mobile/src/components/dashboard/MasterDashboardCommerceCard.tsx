import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card } from '@src/components/Card';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { StatusBadge } from '@src/components/StatusBadge';
import { formatMoney } from '@src/utils/money';
import { getPlanTitle } from '@src/utils/planTitle';
import {
  getDaysRemaining,
  getStatusColor,
  getStatusLabel,
} from '@src/services/api/subscriptions';
import type { MasterDashboardCommerceData } from './masterDashboardCommerce';

export function MasterDashboardCommerceCard({
  data,
  styles,
}: {
  data: MasterDashboardCommerceData | null;
  styles: Record<string, any>;
}) {
  const balance = data?.balance;
  const bookingsLimit = data?.bookingsLimit;
  const subscription = data?.subscription;
  if (!balance && !bookingsLimit && !subscription) return null;

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Подписка</Text>
      <View style={styles.financeContent}>
        {balance ? (
          <View style={styles.financeRow}>
            <Text style={styles.financeLabel}>Баланс</Text>
            <Text style={styles.financeValue}>{formatMoney(balance.available_balance ?? 0)}</Text>
          </View>
        ) : null}
        {subscription?.end_date != null ? (
          <View style={styles.financeRow}>
            <Text style={styles.financeLabel}>Дней осталось</Text>
            <View style={styles.daysRemainingCol}>
              <Text
                style={[
                  styles.financeValue,
                  (subscription.days_remaining ?? getDaysRemaining(subscription.end_date)) === 0 &&
                  (subscription.daily_rate ?? 0) > 0 &&
                  (subscription.plan_name ?? '').toLowerCase() !== 'free'
                    ? styles.financeValueZero
                    : null,
                ]}
              >
                {subscription.days_remaining ?? getDaysRemaining(subscription.end_date)}
              </Text>
              {(subscription.days_remaining ?? getDaysRemaining(subscription.end_date)) === 0 &&
              (subscription.daily_rate ?? 0) > 0 &&
              (subscription.plan_name ?? '').toLowerCase() !== 'free' ? (
                <Text style={styles.zeroDaysHint}>Пополните баланс, чтобы подписка не отключилась</Text>
              ) : null}
            </View>
          </View>
        ) : null}
        {subscription ? (
          <View style={styles.financeRow}>
            <Text style={styles.financeLabel}>Подписка</Text>
            <View style={styles.subscriptionRow}>
              <Text style={styles.subscriptionName}>
                {getPlanTitle({
                  plan_display_name: subscription.plan_display_name,
                  plan_name: subscription.plan_name ?? undefined,
                }) || 'Базовый план'}
              </Text>
              <StatusBadge label={getStatusLabel(subscription.status)} color={getStatusColor(subscription.status)} />
            </View>
          </View>
        ) : null}
        {bookingsLimit && !bookingsLimit.is_unlimited && bookingsLimit.plan_name === 'Free' ? (
          <View style={styles.financeRow}>
            <Text style={styles.financeLabel}>Активные записи</Text>
            <Text style={styles.financeValue}>{bookingsLimit.current_bookings} / {bookingsLimit.limit}</Text>
          </View>
        ) : null}
      </View>
      <SecondaryButton title="Управление подпиской" onPress={() => router.push('/subscriptions')} style={styles.secondaryButton} />
    </Card>
  );
}
