import { useState, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addToFavorites, removeFromFavorites, FavoriteType } from '@src/services/api/favorites';
import { useAuth } from '@src/auth/AuthContext';

interface FavoriteButtonProps {
  type: FavoriteType;
  itemId: number;
  itemName: string;
  size?: 'sm' | 'md' | 'lg';
  onFavoriteChange?: (type: FavoriteType, itemId: number, isFavorite: boolean) => void;
  initialFavorite?: boolean;
}

export function FavoriteButton({
  type,
  itemId,
  itemName,
  size = 'md',
  onFavoriteChange,
  initialFavorite = false,
}: FavoriteButtonProps) {
  const { user } = useAuth();
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [isLoading, setIsLoading] = useState(false);

  // Скрываем кнопку избранного для мастеров/салонов (только для клиентов)
  const userRole = user?.role?.toLowerCase();
  if (userRole !== 'client') {
    return null;
  }

  useEffect(() => {
    setIsFavorite(initialFavorite);
  }, [initialFavorite]);

  const handleToggle = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      if (isFavorite) {
        await removeFromFavorites(type, itemId);
        setIsFavorite(false);
        if (onFavoriteChange) {
          onFavoriteChange(type, itemId, false);
        }
      } else {
        await addToFavorites(type, itemId, itemName);
        setIsFavorite(true);
        if (onFavoriteChange) {
          onFavoriteChange(type, itemId, true);
        }
      }
    } catch (error) {
      console.error('Ошибка при изменении избранного:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const iconSize = size === 'sm' ? 16 : size === 'lg' ? 24 : 20;

  return (
    <TouchableOpacity
      testID="favorite-button"
      onPress={handleToggle}
      disabled={isLoading}
      style={styles.button}
      activeOpacity={0.7}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={isFavorite ? '#F44336' : '#4CAF50'} />
      ) : (
        <Ionicons
          name={isFavorite ? 'heart' : 'heart-outline'}
          size={iconSize}
          color={isFavorite ? '#F44336' : '#999'}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

