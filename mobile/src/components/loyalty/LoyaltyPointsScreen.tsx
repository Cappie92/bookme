import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLoyaltyPoints } from '@src/hooks/useLoyaltyPoints';
import { LoyaltyMasterCard } from './LoyaltyMasterCard';
import { formatLoyaltyPoints } from '@src/services/api/loyalty';

/**
 * Экран "Мои баллы" для клиента
 * 
 * Показывает:
 * - Список мастеров с балансами
 * - Раскрываемая история транзакций по каждому мастеру
 * - Empty state при 0 баллов
 * - Обработка ошибок (403, 500, network)
 */
export function LoyaltyPointsScreen() {
  const { data, loading, error, refresh } = useLoyaltyPoints();

  // Loading state
  if (loading && !data) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Загрузка баллов...</Text>
      </View>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refresh}>
          <Text style={styles.retryButtonText}>Повторить</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Empty state
  if (!data || data.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="gift-outline" size={64} color="#ccc" style={styles.emptyIcon} />
        <Text style={styles.emptyTitle}>У вас пока нет баллов</Text>
        <Text style={styles.emptyDescription}>
          Баллы начисляются после успешного завершения услуг у мастеров с включенной программой лояльности
        </Text>
      </View>
    );
  }

  // Success state: список мастеров
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>
            {error} (показаны данные из кеша)
          </Text>
          <TouchableOpacity onPress={refresh}>
            <Text style={styles.errorBannerLink}>Обновить</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {data.map((masterPoints) => (
        <LoyaltyMasterCard
          key={masterPoints.master_id}
          masterPoints={masterPoints}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  contentContainer: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBanner: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorBannerText: {
    flex: 1,
    fontSize: 14,
    color: '#856404',
  },
  errorBannerLink: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
});
