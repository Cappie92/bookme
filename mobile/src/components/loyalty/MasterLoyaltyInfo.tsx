import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@src/components/Card';
import {
  getMasterLoyaltySettingsPublic,
  MasterLoyaltySettingsPublic,
} from '@src/services/api/loyalty';

/**
 * Read-only компонент для отображения информации о программе лояльности мастера
 * Используется в клиентском UI (детали бронирования, карточка мастера и т.д.)
 */
interface MasterLoyaltyInfoProps {
  masterId: number;
  style?: any;
}

export function MasterLoyaltyInfo({ masterId, style }: MasterLoyaltyInfoProps) {
  const [settings, setSettings] = useState<MasterLoyaltySettingsPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setError(null);
        setLoading(true);
        const data = await getMasterLoyaltySettingsPublic(masterId);
        setSettings(data);
        
        if (__DEV__) {
          console.log('[MASTER LOYALTY INFO] Loaded for master', masterId, data);
        }
      } catch (err: any) {
        // Игнорируем ошибки - просто не показываем блок
        if (__DEV__) {
          console.warn('[MASTER LOYALTY INFO] Error loading:', err);
        }
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [masterId]);

  // Не показываем ничего, если загрузка или ошибка
  if (loading || error || !settings) {
    return null;
  }

  // Не показываем, если программа выключена
  if (!settings.is_enabled) {
    return null;
  }

  // Форматируем срок жизни баллов
  const formatLifetime = (days: number | null): string => {
    if (!days) return 'бесконечно';
    if (days === 14) return '14 дней';
    if (days === 30) return '30 дней';
    if (days === 60) return '60 дней';
    if (days === 90) return '90 дней';
    if (days === 180) return '180 дней';
    if (days === 365) return '365 дней';
    return `${days} дней`;
  };

  return (
    <Card style={[styles.container, style]}>
      <View style={styles.header}>
        <Ionicons name="gift-outline" size={22} color="#4CAF50" style={styles.icon} />
        <Text style={styles.title}>Программа лояльности</Text>
      </View>
      
      <View style={styles.content}>
        {settings.accrual_percent && (
          <Text style={styles.text}>
            Начисляем {settings.accrual_percent}% баллами
          </Text>
        )}
        {settings.max_payment_percent && (
          <Text style={styles.text}>
            Можно оплатить до {settings.max_payment_percent}%
          </Text>
        )}
        {settings.points_lifetime_days !== null && (
          <Text style={styles.text}>
            Срок действия: {formatLifetime(settings.points_lifetime_days)}
          </Text>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  content: {
    gap: 4,
  },
  text: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});
