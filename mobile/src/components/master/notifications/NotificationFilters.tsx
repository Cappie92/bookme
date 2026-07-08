import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import type { NotificationFilterKey } from './notificationsTypes';

const FILTERS: { key: NotificationFilterKey; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'new', label: 'Новые' },
  { key: 'updated', label: 'Изменения' },
  { key: 'cancelled', label: 'Отмены' },
];

interface NotificationFiltersProps {
  value: NotificationFilterKey;
  onChange: (key: NotificationFilterKey) => void;
}

export function NotificationFilters({ value, onChange }: NotificationFiltersProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      {FILTERS.map((f) => {
        const active = value === f.key;
        return (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(f.key)}
            activeOpacity={0.85}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginBottom: 14,
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#F4F6F4',
    borderWidth: 1,
    borderColor: '#E4ECE4',
  },
  chipActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#D2EAD4',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#667066',
  },
  chipTextActive: {
    color: '#2E7D32',
  },
});
