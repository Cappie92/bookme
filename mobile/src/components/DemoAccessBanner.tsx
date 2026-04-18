import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface DemoAccessBannerProps {
  title?: string;
  description: string;
  ctaText?: string;
  onCtaPress?: () => void;
}

/**
 * Унифицированный баннер для демо-режима платных разделов.
 * Показывается фиксированно сверху при отсутствии доступа.
 */
export function DemoAccessBanner({
  description,
  ctaText = 'Перейти к тарифам',
  onCtaPress,
}: DemoAccessBannerProps) {
  const handlePress = () => {
    if (onCtaPress) {
      onCtaPress();
    } else {
      router.push('/subscriptions');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="information-circle" size={22} color="#B45309" style={styles.icon} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>Демонстрационный доступ</Text>
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.cta} onPress={handlePress}>
        <Text style={styles.ctaText}>{ctaText}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1,
    borderBottomColor: '#FCD34D',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  icon: {
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
  },
  description: {
    fontSize: 13,
    color: '#B45309',
    marginTop: 2,
  },
  cta: {
    backgroundColor: '#D97706',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  ctaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
