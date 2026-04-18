import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  LoyaltyTransaction,
  LoyaltyTransactionType,
  getTransactionTypeColor,
  getTransactionTypeLabel,
  formatExpiresDate,
} from '@src/services/api/loyalty';

/**
 * Элемент истории транзакции
 * 
 * Показывает:
 * - Тип операции (earned/spent) с цветом
 * - Количество баллов (+/-)
 * - Название услуги (если есть)
 * - Дата операции
 * - Дата истечения (только для earned)
 */
interface LoyaltyTransactionItemProps {
  transaction: LoyaltyTransaction;
}

export function LoyaltyTransactionItem({ transaction }: LoyaltyTransactionItemProps) {
  const isEarned = transaction.transaction_type === LoyaltyTransactionType.EARNED;
  const color = getTransactionTypeColor(transaction.transaction_type);
  const label = getTransactionTypeLabel(transaction.transaction_type);

  // Форматируем дату операции
  const date = new Date(transaction.earned_at);
  const dateStr = date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <View style={styles.typeContainer}>
          <View style={[styles.typeBadge, { backgroundColor: color }]}>
            <Text style={styles.typeBadgeText}>{label}</Text>
          </View>
          <Text style={[styles.points, { color }]}>
            {isEarned ? '+' : '-'}{transaction.points}
          </Text>
        </View>
        
        {transaction.service_name && (
          <Text style={styles.serviceName}>{transaction.service_name}</Text>
        )}
        
        <Text style={styles.date}>{dateStr}</Text>
        
        {isEarned && transaction.expires_at && (
          <Text style={styles.expiresDate}>
            {formatExpiresDate(transaction.expires_at)}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  leftSection: {
    flex: 1,
  },
  typeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  points: {
    fontSize: 16,
    fontWeight: '600',
  },
  serviceName: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  expiresDate: {
    fontSize: 11,
    color: '#E65100',
    marginTop: 2,
  },
});
