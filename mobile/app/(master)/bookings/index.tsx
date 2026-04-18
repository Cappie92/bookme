import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@src/auth/AuthContext';
import { ScreenContainer } from '@src/components/ScreenContainer';
import { Card } from '@src/components/Card';
import { StatusBadge } from '@src/components/StatusBadge';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { getFutureBookings, Booking, getStatusLabel, getStatusColor } from '@src/services/api/bookings';
import { FavoriteButton } from '@src/components/FavoriteButton';

export default function BookingsScreen() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadBookings = async () => {
    try {
      setError(null);
      const data = await getFutureBookings(user?.role);
      setBookings(data);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Ошибка загрузки бронирований';
      setError(errorMessage);
      console.error('Error loading bookings:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadBookings();
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const renderBookingItem = ({ item }: { item: Booking }) => {
    const statusColor = getStatusColor(item.status);
    const statusLabel = getStatusLabel(item.status);
    const duration = item.service_duration || item.duration;
    
    // Master-only: тип и ID для избранного
    const getFavoriteType = (): 'master' | 'salon' | null => {
      if (item.master_id) return 'master';
      if (item.salon_id) return 'salon';
      return null;
    };

    const favoriteType = getFavoriteType();
    const favoriteItemId = item.master_id || item.salon_id;

    // Визуальная ссылка на профиль мастера
    const renderMasterLink = () => {
      if (!item.master_name || item.master_name === '-') return null;
      
      return (
        <View style={styles.masterLinkContainer}>
          <Text style={styles.masterLink}>
            Мастер: {item.master_name}
          </Text>
          {favoriteType && favoriteItemId && favoriteType === 'master' && (
            <FavoriteButton
              type={favoriteType}
              itemId={favoriteItemId}
              itemName={item.master_name}
              size="sm"
            />
          )}
        </View>
      );
    };

    // Кнопка избранного для салона
    const renderSalonFavorite = () => {
      if (!item.salon_id || !item.salon_name || item.salon_name === '-') return null;
      
      return (
        <View style={styles.salonFavoriteContainer}>
          <Text style={styles.salonName}>{item.salon_name}</Text>
          <FavoriteButton
            type="salon"
            itemId={item.salon_id}
            itemName={item.salon_name}
            size="sm"
          />
        </View>
      );
    };
    
    return (
      <TouchableOpacity
        testID={`booking-item-${item.id}`}
        onPress={() => router.push(`/bookings/${item.id}`)}
        activeOpacity={0.7}
        style={styles.cardWrapper}
      >
        <Card>
          <View style={styles.bookingHeader}>
            <View style={styles.bookingHeaderLeft}>
              <Text style={styles.serviceName}>{item.service_name || 'Услуга не указана'}</Text>
              {renderSalonFavorite()}
              {!item.salon_id && renderMasterLink()}
              {item.branch_name && (
                <Text style={styles.branchName}>{item.branch_name}</Text>
              )}
            </View>
            <StatusBadge label={statusLabel} color={statusColor} />
          </View>
        
          <View style={styles.bookingDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Дата:</Text>
              <Text style={styles.detailValue}>{formatDate(item.start_time)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Время:</Text>
              <Text style={styles.detailValue}>
                {formatTime(item.start_time)} - {formatTime(item.end_time)}
              </Text>
            </View>
            {duration && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Длительность:</Text>
                <Text style={styles.detailValue}>{duration} мин</Text>
              </View>
            )}
            {item.payment_amount && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Стоимость:</Text>
                <Text style={styles.detailValue}>{item.payment_amount} ₽</Text>
              </View>
            )}
            {item.is_paid !== null && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Оплата:</Text>
                <Text style={[styles.detailValue, item.is_paid ? styles.paid : styles.unpaid]}>
                  {item.is_paid ? 'Оплачено' : 'Не оплачено'}
                </Text>
              </View>
            )}
          </View>
          
          {item.notes && (
            <View style={styles.notesContainer}>
              <Text style={styles.notesLabel}>Заметки:</Text>
              <Text style={styles.notesText}>{item.notes}</Text>
            </View>
          )}
        </Card>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Загрузка бронирований...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <Text style={styles.errorTitle}>Ошибка</Text>
          <Text style={styles.errorText}>{error}</Text>
          <PrimaryButton title="Повторить" onPress={loadBookings} />
        </View>
      </ScreenContainer>
    );
  }

  if (bookings.length === 0) {
    return (
      <ScreenContainer>
        <View style={styles.centerContainer}>
          <Text style={styles.emptyTitle}>Нет записей</Text>
          <Text style={styles.emptyText}>У вас нет будущих записей</Text>
          <PrimaryButton title="Обновить" onPress={handleRefresh} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View testID="bookings-screen">
        <FlatList
          testID="bookings-list"
          data={bookings}
          renderItem={renderBookingItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#4CAF50']}
            />
          }
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardWrapper: {
    marginBottom: 12,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#F44336',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  listContent: {
    padding: 16,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  bookingHeaderLeft: {
    flex: 1,
  },
  serviceName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  branchName: {
    fontSize: 12,
    color: '#999',
  },
  bookingDetails: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  paid: {
    color: '#4CAF50',
  },
  unpaid: {
    color: '#F44336',
  },
  notesContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  notesLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500',
  },
  notesText: {
    fontSize: 14,
    color: '#333',
    fontStyle: 'italic',
  },
  masterLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  masterLink: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  salonFavoriteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  salonName: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
});
