/**
 * LoyaltyHistoryScreen - история транзакций лояльности
 * Может показывать историю конкретного мастера (если передан masterId)
 * или список всех мастеров для выбора
 */

import React, { useEffect, useState } from 'react'
import { View, ScrollView, Text, StyleSheet, RefreshControl, Alert } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { getLoyaltyHistory, LoyaltyTransaction, getClientLoyaltyPoints } from '@src/services/api/clientDashboard'
import { formatDateTimeShort } from '@src/utils/clientDashboard'

// Components
import { ScreenContainer } from '@src/components/ScreenContainer'

export default function LoyaltyHistoryScreen() {
  const params = useLocalSearchParams<{ masterId?: string; masterName?: string }>()
  
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  
  const masterId = params.masterId ? Number(params.masterId) : null
  const masterName = params.masterName || 'История'
  
  const loadData = async () => {
    if (!masterId) {
      // Если нет masterId — показываем пустое состояние или список мастеров
      // Для простоты сейчас просто пустое состояние
      return
    }
    
    try {
      setIsLoading(true)
      const data = await getLoyaltyHistory(masterId)
      setTransactions(data)
    } catch (error) {
      if (__DEV__) console.error('[LoyaltyHistory] Ошибка загрузки:', error)
      Alert.alert('Ошибка', 'Не удалось загрузить историю')
    } finally {
      setIsLoading(false)
    }
  }
  
  const onRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }
  
  useEffect(() => {
    loadData()
  }, [masterId])
  
  return (
    <ScreenContainer>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />
        }
      >
        <View style={styles.content}>
          <Text style={styles.title}>История: {masterName}</Text>
          
          {transactions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Нет транзакций</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {transactions.map(tx => {
                const isEarned = tx.transaction_type === 'earned'
                const displayPoints = isEarned ? tx.points : -tx.points
                const reasonText = tx.service_name || (isEarned ? 'Начисление' : 'Списание')
                return (
                  <View key={tx.id} style={styles.transactionRow}>
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionReason} numberOfLines={2}>
                        {reasonText}
                      </Text>
                      <Text style={styles.transactionDate}>
                        {formatDateTimeShort(tx.earned_at ?? tx.created_at)}
                      </Text>
                    </View>
                    
                    <Text style={[
                      styles.transactionAmount,
                      isEarned ? styles.amountPositive : styles.amountNegative
                    ]}>
                      {displayPoints > 0 ? '+' : ''}{displayPoints}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    padding: 8,
  },
  emptyContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  transactionInfo: {
    flex: 1,
    marginRight: 12,
  },
  transactionReason: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  amountPositive: {
    color: '#16a34a',
  },
  amountNegative: {
    color: '#dc2626',
  },
})
