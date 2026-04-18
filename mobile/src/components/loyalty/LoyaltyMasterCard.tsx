import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ClientLoyaltyPointsOut, formatLoyaltyPoints } from '@src/services/api/loyalty';
import { LoyaltyTransactionsList } from './LoyaltyTransactionsList';

/**
 * Карточка баланса баллов по конкретному мастеру
 * 
 * Показывает:
 * - Имя мастера
 * - Активный баланс
 * - Истекшие баллы (если есть)
 * - Кнопка раскрытия истории транзакций
 */
interface LoyaltyMasterCardProps {
  masterPoints: ClientLoyaltyPointsOut;
}

export function LoyaltyMasterCard({ masterPoints }: LoyaltyMasterCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerContent}>
          <Text style={styles.masterName}>{masterPoints.master_name}</Text>
          <View style={styles.balanceContainer}>
            <Text style={styles.balanceLabel}>Баланс:</Text>
            <Text style={styles.balanceValue}>
              {formatLoyaltyPoints(masterPoints.active_points)}
            </Text>
          </View>
        </View>
        <View style={styles.expandIconWrap}>
          <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={20} color="#999" />
        </View>
      </TouchableOpacity>

      {masterPoints.expired_points > 0 && (
        <View style={styles.expiredBanner}>
          <Text style={styles.expiredText}>
            Истекло: {formatLoyaltyPoints(masterPoints.expired_points)}
          </Text>
        </View>
      )}

      {isExpanded && (
        <View style={styles.transactionsContainer}>
          <LoyaltyTransactionsList transactions={masterPoints.transactions} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  headerContent: {
    flex: 1,
  },
  masterName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  balanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4CAF50',
  },
  expandIconWrap: {
    marginLeft: 8,
  },
  expiredBanner: {
    backgroundColor: '#FFF3E0',
    padding: 8,
    paddingHorizontal: 16,
  },
  expiredText: {
    fontSize: 12,
    color: '#E65100',
  },
  transactionsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 8,
  },
});
