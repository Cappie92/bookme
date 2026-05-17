/**
 * История транзакций лояльности (по мастеру или сводно по всем мастерам из /points).
 */

import React, { useEffect, useState } from 'react'
import { View, ScrollView, Text, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { getLoyaltyHistory, LoyaltyTransaction } from '@src/services/api/clientDashboard'
import { formatDateTimeShort } from '@src/utils/clientDashboard'

import { ScreenContainer } from '@src/components/ScreenContainer'

export default function LoyaltyHistoryScreen() {
  const params = useLocalSearchParams<{ masterId?: string; masterName?: string }>()

  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const masterId =
    params.masterId != null && String(params.masterId).trim() !== ''
      ? Number(params.masterId)
      : null
  const masterIdOk = masterId != null && !Number.isNaN(masterId) ? masterId : null

  const masterNameSubtitle =
    typeof params.masterName === 'string' && params.masterName.trim().length > 0
      ? params.masterName.trim()
      : ''

  const loadData = async () => {
    try {
      setIsLoading(true)
      const data = await getLoyaltyHistory(masterIdOk)
      setTransactions(data)
    } catch (error) {
      if (__DEV__) console.error('[LoyaltyHistory] Ошибка загрузки:', error)
      setTransactions([])
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
  }, [masterIdOk])

  return (
    <ScreenContainer>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />
        }
      >
        <View style={styles.content}>
          {masterNameSubtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {masterNameSubtitle}
            </Text>
          ) : (
            <Text style={styles.subtitleMuted}>Все мастера</Text>
          )}

          {isLoading && transactions.length === 0 ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color="#16a34a" />
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Нет транзакций</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {transactions.map((tx) => {
                const isEarned = tx.transaction_type === 'earned'
                const displayPoints = isEarned ? tx.points : -tx.points
                const reasonText =
                  tx.service_name ||
                  (isEarned ? 'Начисление баллов' : 'Списание баллов (оплата записи)')
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

                    <Text
                      style={[
                        styles.transactionAmount,
                        isEarned ? styles.amountPositive : styles.amountNegative,
                      ]}
                    >
                      {displayPoints > 0 ? '+' : ''}
                      {displayPoints} б.
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
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  subtitleMuted: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 12,
  },
  loadingBox: {
    padding: 24,
    alignItems: 'center',
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
