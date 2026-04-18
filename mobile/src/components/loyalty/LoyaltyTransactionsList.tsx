import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { LoyaltyTransaction } from '@src/services/api/loyalty';
import { LoyaltyTransactionItem } from './LoyaltyTransactionItem';

/**
 * Список транзакций лояльности
 * 
 * Показывает последние 50 транзакций (как в веб-версии)
 */
interface LoyaltyTransactionsListProps {
  transactions: LoyaltyTransaction[];
}

export function LoyaltyTransactionsList({ transactions }: LoyaltyTransactionsListProps) {
  if (transactions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Нет транзакций</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={transactions}
      keyExtractor={(item) => item.id.toString()}
      renderItem={({ item }) => <LoyaltyTransactionItem transaction={item} />}
      scrollEnabled={false} // Вложенный список не скроллится
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  separator: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 16,
  },
});
