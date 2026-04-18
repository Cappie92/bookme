import React from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFeatureAccess } from '@src/hooks/useFeatureAccess';
import { router } from 'expo-router';

interface FeatureLockProps {
  feature: string; // Ключ функции (например, 'has_finance_access')
  children: React.ReactNode;
  fallback?: React.ReactNode; // Кастомный fallback UI (опционально)
  onPress?: () => void; // Кастомный обработчик нажатия (опционально)
  disabled?: boolean; // Дополнительное отключение (опционально)
}

/**
 * Компонент-обертка для ограничения доступа к функциям по тарифам
 * Если функция недоступна, показывает disabled UI и при тапе показывает Alert с подсказкой
 */
export function FeatureLock({
  feature,
  children,
  fallback,
  onPress,
  disabled = false,
}: FeatureLockProps) {
  const { allowed, reasonText, cheapestPlanName } = useFeatureAccess(feature);

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }

    // Показываем Alert с подсказкой
    Alert.alert(
      'Функция недоступна',
      reasonText,
      [
        {
          text: 'Отмена',
          style: 'cancel',
        },
        {
          text: 'Управление подпиской',
          onPress: () => {
            router.push('/subscriptions');
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Если функция доступна и не disabled, показываем children
  if (allowed && !disabled) {
    return <>{children}</>;
  }

  // Если функция недоступна или disabled
  if (fallback) {
    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
        {fallback}
      </TouchableOpacity>
    );
  }

  // Дефолтный disabled UI
  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7} disabled={false}>
      <View style={styles.disabledContainer}>
        {children}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  disabledContainer: {
    opacity: 0.5,
  },
});

