/**
 * TimeSlotsPicker — список слотов для выбранной даты.
 * Слоты: start_time–end_time, плашки.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { formatTimeRange } from '@src/utils/format';
import type { PublicSlot } from './types';

interface TimeSlotsPickerProps {
  slots: PublicSlot[];
  selectedDate: string | null;
  selectedSlot: PublicSlot | null;
  onSelect: (slot: PublicSlot) => void;
  loading?: boolean;
}

export function TimeSlotsPicker({
  slots,
  selectedDate,
  selectedSlot,
  onSelect,
  loading,
}: TimeSlotsPickerProps) {
  const slotsForDate = React.useMemo(() => {
    if (!selectedDate) return [];
    return slots
      .filter((s) => s.start_time.startsWith(selectedDate))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [slots, selectedDate]);

  if (!selectedDate) return null;

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color="#4CAF50" />
        <Text style={styles.loadingText}>Загрузка слотов...</Text>
      </View>
    );
  }

  if (slotsForDate.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>Нет свободных слотов на эту дату</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {slotsForDate.map((slot, i) => {
          const isSelected =
            selectedSlot?.start_time === slot.start_time &&
            selectedSlot?.end_time === slot.end_time;
          return (
            <TouchableOpacity
              key={`${slot.start_time}-${i}`}
              style={[styles.chip, isSelected && styles.chipSelected]}
              onPress={() => onSelect(slot)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipText}>
                {formatTimeRange(slot.start_time, slot.end_time)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
    marginHorizontal: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  chipSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#e8f5e9',
  },
  chipText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  emptyWrap: {
    marginTop: 16,
    paddingVertical: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
  },
});
