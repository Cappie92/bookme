import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { PrimaryButton } from './PrimaryButton';
import { getAllFavorites, Favorite, getFavoriteName, getFavoriteItemId, removeFromFavorites, FavoriteType } from '@src/services/api/favorites';

interface FavoritesModalProps {
  visible: boolean;
  onClose: () => void;
  initialFavorites: Favorite[];
  onFavoriteRemoved?: () => void;
}

const ITEMS_PER_PAGE = 10;

export function FavoritesModal({
  visible,
  onClose,
  initialFavorites,
  onFavoriteRemoved,
}: FavoritesModalProps) {
  const [favorites, setFavorites] = useState<Favorite[]>(initialFavorites);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setFavorites(initialFavorites);
      setCurrentPage(0);
    }
  }, [visible, initialFavorites]);

  const totalPages = Math.ceil(favorites.length / ITEMS_PER_PAGE);
  const startIndex = currentPage * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentFavorites = favorites.slice(startIndex, endIndex);

  const canGoBack = currentPage > 0;
  const canGoForward = currentPage < totalPages - 1;

  const handleRemove = async (favorite: Favorite) => {
    const itemId = getFavoriteItemId(favorite);
    if (!itemId) return;

    setRemovingId(favorite.id);
    try {
      await removeFromFavorites(favorite.type as FavoriteType, itemId);
      // Удаляем из локального состояния
      setFavorites((prev) => prev.filter((f) => f.id !== favorite.id));
      if (onFavoriteRemoved) {
        onFavoriteRemoved();
      }
    } catch (error) {
      console.error('Ошибка при удалении из избранного:', error);
    } finally {
      setRemovingId(null);
    }
  };

  const getFavoriteTypeLabel = (type: FavoriteType): string => {
    switch (type) {
      case 'salon':
        return 'Салон';
      case 'master':
        return 'Мастер';
      case 'service':
        return 'Услуга';
      default:
        return 'Избранное';
    }
  };

  const renderFavoriteItem = ({ item }: { item: Favorite }) => {
    const isRemoving = removingId === item.id;
    const name = getFavoriteName(item);
    const typeLabel = getFavoriteTypeLabel(item.type as FavoriteType);

    return (
      <Card style={styles.favoriteCard}>
        <View style={styles.favoriteHeader}>
          <View style={styles.favoriteInfo}>
            <Text style={styles.favoriteType}>{typeLabel}</Text>
            <Text style={styles.favoriteName}>{name}</Text>
            {item.type === 'service' && item.service && (
              <View style={styles.serviceDetails}>
                <Text style={styles.servicePrice}>{item.service.price} ₽</Text>
                <Text style={styles.serviceDuration}>{item.service.duration} мин</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            testID="favorites-modal-remove"
            onPress={() => handleRemove(item)}
            disabled={isRemoving}
            style={styles.removeButton}
          >
            {isRemoving ? (
              <ActivityIndicator size="small" color="#F44336" />
            ) : (
              <Ionicons name="close-circle" size={24} color="#F44336" />
            )}
          </TouchableOpacity>
        </View>
      </Card>
    );
  };

  return (
    <Modal
      testID="favorites-modal"
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Избранное</Text>
            <TouchableOpacity testID="favorites-modal-close" onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {favorites.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Нет избранных элементов</Text>
            </View>
          ) : (
            <>
              <FlatList
                data={currentFavorites}
                renderItem={renderFavoriteItem}
                keyExtractor={(item) => `${item.type}-${item.id}`}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />

              <View style={styles.pagination}>
                <TouchableOpacity
                  testID="favorites-modal-prev"
                  onPress={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                  disabled={!canGoBack}
                  style={[styles.paginationButton, !canGoBack && styles.paginationButtonDisabled]}
                >
                  <Text style={[styles.paginationButtonText, !canGoBack && styles.paginationButtonTextDisabled]}>
                    Назад
                  </Text>
                </TouchableOpacity>

                <Text testID="favorites-modal-page-info" style={styles.paginationInfo}>
                  {currentPage + 1} / {totalPages}
                </Text>

                <TouchableOpacity
                  testID="favorites-modal-next"
                  onPress={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
                  disabled={!canGoForward}
                  style={[styles.paginationButton, !canGoForward && styles.paginationButtonDisabled]}
                >
                  <Text style={[styles.paginationButtonText, !canGoForward && styles.paginationButtonTextDisabled]}>
                    Вперед
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
  },
  favoriteCard: {
    marginBottom: 12,
  },
  favoriteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  favoriteInfo: {
    flex: 1,
  },
  favoriteType: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  favoriteName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  serviceDetails: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  servicePrice: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  serviceDuration: {
    fontSize: 14,
    color: '#666',
  },
  removeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  paginationButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
  },
  paginationButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  paginationButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  paginationButtonTextDisabled: {
    color: '#999',
  },
  paginationInfo: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
});

