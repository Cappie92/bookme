import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { fetchBookingById, Booking, getStatusLabel, getStatusColor, cancelBooking, BookingStatus } from '@src/services/api/bookings';
import { BookingTimeEditModal } from '@src/components/BookingTimeEditModal';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { MasterLoyaltyInfo } from '@src/components/loyalty/MasterLoyaltyInfo';
import { safeBack } from '@src/utils/safeBack';

const CLIENT_BOOKINGS_FALLBACK = '/client/dashboard';

export default function BookingDetailScreen() {
  const { id, openEdit } = useLocalSearchParams<{ id: string; openEdit?: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showTimeEditModal, setShowTimeEditModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [didOpenEditFromParam, setDidOpenEditFromParam] = useState(false);

  const loadBooking = async () => {
    if (!id) {
      setError('ID бронирования не указан');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const bookingId = typeof id === 'string' ? parseInt(id, 10) : id;
      if (isNaN(bookingId)) {
        throw new Error('Неверный ID бронирования');
      }
      const data = await fetchBookingById(bookingId);
      setBooking(data);
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 404) {
        setError('Бронирование не найдено');
      } else {
        const errorMessage = err.response?.data?.detail || err.message || 'Ошибка загрузки бронирования';
        setError(errorMessage);
      }
      console.error('Error loading booking:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBooking();
  }, [id]);

  // Открыть модалку "Изменить время" при переходе с кнопки "Редактировать" из списка (openEdit=time)
  useEffect(() => {
    if (booking && openEdit === 'time' && !didOpenEditFromParam) {
      setDidOpenEditFromParam(true);
      setShowTimeEditModal(true);
    }
  }, [booking, openEdit, didOpenEditFromParam]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadBooking();
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

  const formatDateTime = (dateString: string | null | undefined): string => {
    if (!dateString) return 'Не указано';
    return `${formatDate(dateString)} ${formatTime(dateString)}`;
  };

  const getDisplayName = (booking: Booking): string => {
    if (booking.salon_name) {
      return booking.salon_name;
    }
    if (booking.master_name) {
      return booking.master_name;
    }
    return 'Не указано';
  };

  const getDuration = (startTime: string, endTime: string): string => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffMs = end.getTime() - start.getTime();
    const diffMins = Math.round(diffMs / (1000 * 60));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    
    if (hours > 0 && mins > 0) {
      return `${hours} ч ${mins} мин`;
    } else if (hours > 0) {
      return `${hours} ч`;
    } else {
      return `${mins} мин`;
    }
  };

  // Проверяем, является ли бронирование будущим
  const isFutureBooking = (booking: Booking): boolean => {
    // Если статус отменен или завершен, это не будущее бронирование
    if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.COMPLETED) {
      console.log('🔍 [BOOKING] Бронирование не будущее: статус', booking.status);
      return false;
    }
    
    const now = new Date();
    const startTime = new Date(booking.start_time);
    const isFuture = startTime > now;
    
    console.log('🔍 [BOOKING] Проверка будущего бронирования:', {
      id: booking.id,
      status: booking.status,
      startTime: booking.start_time,
      now: now.toISOString(),
      isFuture,
    });
    
    return isFuture;
  };

  const handleCancelBooking = () => {
    if (!booking) return;

    Alert.alert(
      'Отменить бронирование',
      'Вы уверены, что хотите отменить это бронирование?',
      [
        { text: 'Нет', style: 'cancel' },
        {
          text: 'Да, отменить',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await cancelBooking(booking.id);
              Alert.alert('Успешно', 'Бронирование отменено');
              safeBack(CLIENT_BOOKINGS_FALLBACK);
            } catch (error: any) {
              console.error('Ошибка отмены бронирования:', error);
              const errorMessage = error.response?.data?.detail || error.message || 'Не удалось отменить бронирование';
              Alert.alert('Ошибка', errorMessage);
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const handleBookingUpdated = () => {
    loadBooking(); // Перезагружаем данные бронирования
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Stack.Screen
          options={{
            title: 'Загрузка...',
            headerShown: true,
          }}
        />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Загрузка бронирования...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Stack.Screen
          options={{
            title: 'Ошибка',
            headerShown: true,
          }}
        />
        <ScrollView
          contentContainerStyle={styles.centerContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#4CAF50']} />
          }
        >
          <Text style={styles.errorTitle}>Ошибка</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadBooking}>
            <Text style={styles.retryButtonText}>Повторить</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => safeBack(CLIENT_BOOKINGS_FALLBACK)}>
            <Text style={styles.backButtonText}>Назад</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Stack.Screen
          options={{
            title: 'Бронирование не найдено',
            headerShown: true,
          }}
        />
        <View style={styles.centerContainer}>
          <Text style={styles.emptyTitle}>Бронирование не найдено</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => safeBack(CLIENT_BOOKINGS_FALLBACK)}>
            <Text style={styles.backButtonText}>Назад к списку</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getStatusColor(booking.status);
  const statusLabel = getStatusLabel(booking.status);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          title: booking.public_reference?.trim()
            ? `Запись ${booking.public_reference.trim()}`
            : 'Бронирование',
          headerShown: true,
        }}
      />
      <ScrollView
        testID="booking-detail-screen"
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#4CAF50']} />
        }
      >
        {/* Статус */}
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {/* Основная информация */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Основная информация</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Услуга:</Text>
              <Text style={styles.infoValue}>{booking.service_name || 'Не указана'}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Место:</Text>
              <Text style={styles.infoValue}>{getDisplayName(booking)}</Text>
            </View>
            
            {booking.branch_name && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Филиал:</Text>
                <Text style={styles.infoValue}>{booking.branch_name}</Text>
              </View>
            )}
            
            {booking.branch_address && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Адрес:</Text>
                <Text style={styles.infoValue}>{booking.branch_address}</Text>
              </View>
            )}
            
            {booking.master_name && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Мастер:</Text>
                <Text style={styles.infoValue}>{booking.master_name}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Информация о программе лояльности мастера (только для клиентов) */}
        {booking.master_id && (
          <View style={styles.section}>
            <MasterLoyaltyInfo masterId={booking.master_id} />
          </View>
        )}

        {/* Дата и время */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Дата и время</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Дата:</Text>
              <Text style={styles.infoValue}>{formatDate(booking.start_time)}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Время:</Text>
              <Text style={styles.infoValue}>
                {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
              </Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Длительность:</Text>
              <Text style={styles.infoValue}>{getDuration(booking.start_time, booking.end_time)}</Text>
            </View>
          </View>
        </View>

        {/* Оплата */}
        {(booking.payment_amount || booking.payment_method || booking.is_paid !== null) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Оплата</Text>
            
            <View style={styles.infoCard}>
              {booking.payment_amount && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Стоимость:</Text>
                  <Text style={styles.infoValue}>{booking.payment_amount} ₽</Text>
                </View>
              )}
              
              {booking.payment_method && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Способ оплаты:</Text>
                  <Text style={styles.infoValue}>
                    {booking.payment_method === 'on_visit' ? 'При посещении' : 
                     booking.payment_method === 'advance' ? 'Предоплата' : 
                     booking.payment_method}
                  </Text>
                </View>
              )}
              
              {booking.is_paid !== null && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Статус оплаты:</Text>
                  <Text style={[styles.infoValue, booking.is_paid ? styles.paid : styles.unpaid]}>
                    {booking.is_paid ? 'Оплачено' : 'Не оплачено'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Заметки */}
        {booking.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Заметки</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{booking.notes}</Text>
            </View>
          </View>
        )}

        {/* Дополнительная информация */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Дополнительно</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Номер записи:</Text>
              <Text style={styles.infoValue}>
                {booking.public_reference?.trim() || '—'}
              </Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Создано:</Text>
              <Text style={styles.infoValue}>{formatDateTime(booking.created_at)}</Text>
            </View>
            
            {booking.updated_at !== booking.created_at && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Обновлено:</Text>
                <Text style={styles.infoValue}>{formatDateTime(booking.updated_at)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Кнопки действий для будущих бронирований */}
        {booking && (() => {
          const isFuture = isFutureBooking(booking);
          const canShowButtons = booking.status !== BookingStatus.CANCELLED && 
                                 booking.status !== BookingStatus.COMPLETED;
          console.log('🔍 [BOOKING] Рендер кнопок:', { 
            hasBooking: !!booking, 
            isFuture,
            canShowButtons,
            status: booking.status,
            startTime: booking.start_time,
            now: new Date().toISOString()
          });
          // Временно показываем для всех, кроме отмененных и завершенных (для отладки)
          return canShowButtons;
        })() && (
          <View style={styles.actionsSection}>
            <PrimaryButton
              testID="edit-time-button"
              title="Изменить время"
              onPress={() => setShowTimeEditModal(true)}
              style={styles.actionButton}
            />
            <TouchableOpacity
              testID="cancel-booking-button"
              style={[styles.cancelButton, cancelling && styles.cancelButtonDisabled]}
              onPress={handleCancelBooking}
              disabled={cancelling}
            >
              {cancelling ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.cancelButtonText}>Отменить бронирование</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Отступ внизу */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Модальное окно изменения времени */}
      {booking && (
        <BookingTimeEditModal
          visible={showTimeEditModal}
          onClose={() => setShowTimeEditModal(false)}
          bookingId={booking.id}
          currentStartTime={booking.start_time}
          serviceDuration={booking.service_duration || booking.duration || 60}
          onBookingUpdated={handleBookingUpdated}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backButton: {
    backgroundColor: '#666',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    paddingHorizontal: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  paid: {
    color: '#4CAF50',
  },
  unpaid: {
    color: '#F44336',
  },
  notesCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  notesText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  bottomSpacer: {
    height: 24,
  },
  actionsSection: {
    marginTop: 16,
    gap: 12,
  },
  actionButton: {
    width: '100%',
  },
  cancelButton: {
    width: '100%',
    backgroundColor: '#F44336',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  cancelButtonDisabled: {
    opacity: 0.5,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

