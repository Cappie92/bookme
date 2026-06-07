import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Card } from '@src/components/Card';
import {
  Subscription,
  SubscriptionStatus,
  getDisplayDaysRemaining,
} from '@src/services/api/subscriptions';
import { getPlanTitle } from '@src/utils/planTitle';

export interface HomeHeaderCardProps {
  userName: string;
  subscription: Subscription | null;
  onSubscriptionPress: () => void;
}

function formatTodayDate(date: Date): string {
  const weekday = date.toLocaleDateString('ru-RU', { weekday: 'long' });
  const rest = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${capitalizedWeekday}, ${rest}`;
}

function isSubscriptionActive(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  return subscription.status === SubscriptionStatus.ACTIVE;
}

export function HomeHeaderCard({ userName, subscription, onSubscriptionPress }: HomeHeaderCardProps) {
  const active = isSubscriptionActive(subscription);
  const planName = subscription
    ? getPlanTitle({
        plan_display_name: subscription.plan_display_name,
        plan_name: subscription.plan_name,
      })
    : '';
  const daysRemaining = subscription ? getDisplayDaysRemaining(subscription) : 0;

  const subscriptionLine = active && planName
    ? `${planName} · ${daysRemaining} дней`
    : 'Подписка не активна';

  const ctaLabel = active ? 'Управлять' : 'Выбрать тариф';

  return (
    <Card style={styles.card}>
      <View style={styles.accentBar} />
      <Text style={styles.greeting}>Здравствуйте, {userName}</Text>
      <Text style={styles.date}>{formatTodayDate(new Date())}</Text>

      <View style={styles.subscriptionRow}>
        <View style={styles.subscriptionInfo}>
          <Text style={[styles.subscriptionStatus, active && styles.subscriptionStatusActive]}>
            {subscriptionLine}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onSubscriptionPress}
          style={styles.ctaButton}
          activeOpacity={0.75}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#4CAF50',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
    paddingLeft: 8,
  },
  date: {
    fontSize: 14,
    color: '#666',
    marginBottom: 14,
    paddingLeft: 8,
  },
  subscriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingLeft: 8,
  },
  subscriptionInfo: {
    flex: 1,
  },
  subscriptionStatus: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  subscriptionStatusActive: {
    color: '#2e7d32',
  },
  ctaButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2e7d32',
  },
});
