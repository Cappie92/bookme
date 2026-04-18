import React from 'react';
import { Modal, View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Card } from './Card';
import { PrimaryButton } from './PrimaryButton';
import { StatusBadge } from './StatusBadge';
import { FavoriteButton } from './FavoriteButton';
import { Booking, getStatusLabel, getStatusColor } from '@src/services/api/bookings';
import { router } from 'expo-router';

interface AllBookingsModalProps {
  visible: boolean;
  onClose: () => void;
  bookings: Booking[];
  title: string;
}

export function AllBookingsModal({ visible, onClose, bookings, title }: AllBookingsModalProps) {
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
        onPress={() => {
          onClose();
          router.push(`/bookings/${item.id}`);
        }}
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

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>{title}</Text>

          {bookings.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Нет записей</Text>
            </View>
          ) : (
            <FlatList
              data={bookings}
              renderItem={renderBookingItem}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={true}
            />
          )}

          <PrimaryButton title="Закрыть" onPress={onClose} style={styles.closeButton} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  listContainer: {
    width: '100%',
    paddingBottom: 10,
  },
  cardWrapper: {
    marginBottom: 12,
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
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  closeButton: {
    marginTop: 20,
    width: '100%',
  },
});

