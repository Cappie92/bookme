/**
 * LoyaltyPointsScreen - полный список баллов лояльности по мастерам
 */

import React, { useEffect, useState } from 'react'
import { View, ScrollView, Text, StyleSheet, RefreshControl, Alert, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { getClientLoyaltyPoints, ClientLoyaltyMaster } from '@src/services/api/clientDashboard'

// Components
import { ScreenContainer } from '@src/components/ScreenContainer'

export default function LoyaltyPointsScreen() {
  const router = useRouter()
  
  const [masters, setMasters] = useState<ClientLoyaltyMaster[]>([])
  const [totalBalance, setTotalBalance] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  
  const loadData = async () => {
    try {
      setIsLoading(true)
      const data = await getClientLoyaltyPoints()
      setMasters(data.masters)
      setTotalBalance(data.total_balance)
    } catch (error) {
      if (__DEV__) console.error('[LoyaltyPoints] Ошибка загрузки:', error)
      Alert.alert('Ошибка', 'Не удалось загрузить баллы')
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
  }, [])
  
  const handleViewHistory = (masterId: number, masterName: string) => {
    router.push({
      pathname: '/client/loyalty-history',
      params: { masterId: String(masterId), masterName }
    })
  }

  const handlePressMaster = (slug: string | null | undefined) => {
    const s = slug?.trim?.()
    if (s) {
      router.push(`/m/${encodeURIComponent(s)}`)
    } else {
      Alert.alert('Мастер', 'У мастера не настроена публичная страница')
    }
  }
  
  return (
    <ScreenContainer>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16a34a" />
        }
      >
        <View style={styles.content}>
          <Text style={styles.title}>Мои баллы</Text>
          
          {/* Total balance */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Всего баллов</Text>
            <Text style={styles.totalValue}>{totalBalance}</Text>
          </View>
          
          {/* Masters list */}
          {masters.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Пока нет начисленных баллов</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {masters.map(master => (
                <View key={master.master_id} style={styles.masterRow}>
                  <View style={styles.masterInfo}>
                    <TouchableOpacity 
                      onPress={() => handlePressMaster(master.master_domain)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.masterName} numberOfLines={1}>
                        {master.master_name}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.masterBalance}>{master.balance} б.</Text>
                  </View>
                  
                  <TouchableOpacity
                    onPress={() => handleViewHistory(master.master_id, master.master_name)}
                    style={styles.historyButton}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.historyButtonText}>История</Text>
                  </TouchableOpacity>
                </View>
              ))}
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
  totalCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#166534',
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#16a34a',
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
  masterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  masterInfo: {
    flex: 1,
    marginRight: 12,
  },
  masterName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#16a34a',
    marginBottom: 4,
  },
  masterBalance: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  historyButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#16a34a',
  },
  historyButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#16a34a',
  },
})
