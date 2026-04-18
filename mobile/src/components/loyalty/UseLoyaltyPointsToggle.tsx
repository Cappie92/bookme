import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import {
  AvailableLoyaltyPointsOut,
  calculateMaxSpendable,
  formatLoyaltyPoints,
} from '@src/services/api/loyalty';
import { formatMoney } from '@src/utils/formatMoney';

/**
 * Компонент переключателя "Потратить баллы" при бронировании
 * 
 * Логика:
 * - Отображается только если is_loyalty_enabled && available_points > 0
 * - При включении показывает:
 *   - Сколько баллов спишется (max_spendable)
 *   - Сумму к доплате
 * 
 * ⚠️ ВАЖНО: Мобила НЕ списывает баллы реально.
 * Она только отправляет use_loyalty_points: true при создании бронирования.
 * Реальное списание происходит на backend при подтверждении мастером.
 */
interface UseLoyaltyPointsToggleProps {
  availablePoints: AvailableLoyaltyPointsOut | null;
  servicePrice: number;
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function UseLoyaltyPointsToggle({
  availablePoints,
  servicePrice,
  isEnabled,
  onToggle,
}: UseLoyaltyPointsToggleProps) {
  // Проверяем, нужно ли показывать компонент
  const shouldShow = useMemo(() => {
    return (
      availablePoints &&
      availablePoints.is_loyalty_enabled &&
      availablePoints.available_points > 0
    );
  }, [availablePoints]);

  // Вычисляем максимальную сумму списания
  const maxSpendable = useMemo(() => {
    if (!availablePoints) return 0;
    return calculateMaxSpendable(
      availablePoints.available_points,
      servicePrice,
      availablePoints.max_payment_percent
    );
  }, [availablePoints, servicePrice]);

  // Сумма к доплате
  const remainingAmount = useMemo(() => {
    return Math.max(0, servicePrice - maxSpendable);
  }, [servicePrice, maxSpendable]);

  if (!shouldShow) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Потратить баллы</Text>
          <Text style={styles.subtitle}>
            У вас {formatLoyaltyPoints(availablePoints!.available_points)}.
            Можно потратить до {formatMoney(maxSpendable)}
          </Text>
        </View>
        <Switch
          value={isEnabled}
          onValueChange={onToggle}
          trackColor={{ false: '#E0E0E0', true: '#4CAF50' }}
          thumbColor={isEnabled ? '#FFF' : '#FFF'}
        />
      </View>

      {isEnabled && (
        <View style={styles.details}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Будет списано:</Text>
            <Text style={styles.detailValue}>
              {formatLoyaltyPoints(Math.round(maxSpendable))} ({formatMoney(maxSpendable)})
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>К доплате:</Text>
            <Text style={[styles.detailValue, styles.remainingAmount]}>
              {formatMoney(remainingAmount)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
    marginRight: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  details: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  remainingAmount: {
    color: '#4CAF50',
    fontSize: 16,
  },
});
