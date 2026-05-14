/**
 * TimeSlotsPicker — список слотов для выбранной даты.
 * Слоты: start_time–end_time, плашки.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { formatTimeHHMM } from '@src/utils/format';
import type { PublicSlot } from './types';

interface TimeSlotsPickerProps {
  slots: PublicSlot[];
  selectedDate: string | null;
  selectedSlot: PublicSlot | null;
  onSelect: (slot: PublicSlot) => void;
  loading?: boolean;
  /** iOS vs Android визуал чипов */
  uiVariant?: 'ios' | 'android';
  /** Happy hours: бейдж на слоте до выбора (напр. «−13%»), по `loyalty_visual.happy_hours`. */
  slotHhBadgeForSlot?: (slot: PublicSlot) => string | null;
  /** Резерв: не использовать для returning/service и т.п. — только если нужен второй источник. */
  discountHintForSlot?: (slot: PublicSlot) => string | null;
}

export function TimeSlotsPicker({
  slots,
  selectedDate,
  selectedSlot,
  onSelect,
  loading,
  uiVariant = 'android',
  slotHhBadgeForSlot,
  discountHintForSlot,
}: TimeSlotsPickerProps) {
  const { width: windowWidth } = useWindowDimensions();
  /** Учёт padding ScrollView (16×2) + margin контейнера слотов (16×2) → ровно 3 колонки */
  const chipWidth = React.useMemo(() => {
    const horizontalPad = 64;
    const gap = 8;
    const cols = 3;
    const usable = Math.max(0, windowWidth - horizontalPad);
    return Math.max(72, Math.floor((usable - gap * (cols - 1)) / cols));
  }, [windowWidth]);

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
          const hh = slotHhBadgeForSlot?.(slot) ?? null;
          const legacy = !hh && discountHintForSlot ? discountHintForSlot(slot) : null;
          const disc = hh ?? legacy;
          const isHhSlot = !!hh;
          return (
            <TouchableOpacity
              key={`${slot.start_time}-${i}`}
              style={[
                styles.chip,
                { width: chipWidth, maxWidth: chipWidth, flexGrow: 0 },
                uiVariant === 'android' && styles.chipAndroid,
                isHhSlot && styles.chipHhHint,
                isSelected && (uiVariant === 'ios' ? styles.chipSelectedIos : styles.chipSelectedAndroid),
              ]}
              onPress={() => onSelect(slot)}
              activeOpacity={0.7}
            >
              <View style={[styles.chipInner, disc ? styles.chipInnerWithBadge : styles.chipInnerSingle]}>
                <Text
                  style={[
                    styles.chipText,
                    isSelected && uiVariant === 'ios' && styles.chipTextSelectedIos,
                  ]}
                >
                  {formatTimeHHMM(slot.start_time)}
                </Text>
                {disc ? (
                  <Text
                    style={[
                      styles.chipDisc,
                      isSelected && uiVariant === 'ios' && styles.chipDiscSelectedIos,
                    ]}
                    numberOfLines={1}
                  >
                    {disc}
                  </Text>
                ) : null}
              </View>
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
    marginBottom: 8,
    marginHorizontal: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  /** Единая высота всех чипов (как раньше «высокий» вариант со второй строкой). */
  chip: {
    height: 56,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dfe7df',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  chipInner: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Только время — по центру по вертикали. */
  chipInnerSingle: {
    justifyContent: 'center',
  },
  /** Время + скидка: блок чуть выше центра чипа. */
  chipInnerWithBadge: {
    justifyContent: 'flex-start',
    paddingTop: 7,
    paddingBottom: 5,
  },
  chipAndroid: {
    borderRadius: 18,
    borderColor: '#d7e2d7',
  },
  chipHhHint: {
    borderColor: '#8fd49a',
    backgroundColor: '#f4fbf6',
  },
  chipSelectedIos: {
    borderColor: '#50b95a',
    backgroundColor: '#50b95a',
  },
  chipSelectedAndroid: {
    borderColor: '#8fd49a',
    backgroundColor: '#dff4e1',
  },
  chipText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '700',
    textAlign: 'center',
  },
  chipTextSelectedIos: {
    color: '#fff',
  },
  chipDisc: {
    fontSize: 10,
    lineHeight: 12,
    color: '#4d8e55',
    marginTop: 2,
    textAlign: 'center',
    fontWeight: '600',
    maxWidth: '100%',
  },
  chipDiscSelectedIos: {
    color: '#ecffef',
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
