import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface BookingsFilters {
  status: string;
  startDate: string;
  endDate: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'completed', label: 'Завершено' },
  { value: 'cancelled', label: 'Отменено' },
  { value: 'confirmed', label: 'Подтверждено' },
  { value: 'created', label: 'Создано' },
  { value: 'awaiting_confirmation', label: 'На подтверждении' },
  { value: 'cancelled_by_client_early', label: 'Отмена клиентом (до)' },
  { value: 'cancelled_by_client_late', label: 'Отмена клиентом (после)' },
];

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface BookingsFiltersSheetProps {
  visible: boolean;
  onClose: () => void;
  filters: BookingsFilters;
  onApply: (filters: BookingsFilters) => void;
  onReset: () => void;
}

export function BookingsFiltersSheet({ visible, onClose, filters, onApply, onReset }: BookingsFiltersSheetProps) {
  const [draftFilters, setDraftFilters] = useState<BookingsFilters>({
    status: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    if (visible) {
      setDraftFilters({
        status: filters.status || '',
        startDate: filters.startDate || '',
        endDate: filters.endDate || '',
      });
    }
  }, [visible, filters]);

  const applyPreset = (preset: 'today' | 'week' | 'month') => {
    const now = new Date();
    const start = new Date(now);
    let end = new Date(now);
    if (preset === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (preset === 'week') {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
    }
    setDraftFilters((prev) => ({
      ...prev,
      startDate: formatDate(start),
      endDate: formatDate(end),
    }));
  };

  const handleApply = () => {
    onApply(draftFilters);
    onClose();
  };

  const handleReset = () => {
    const empty: BookingsFilters = { status: '', startDate: '', endDate: '' };
    setDraftFilters(empty);
    onReset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Фильтры</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={26} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            <View style={styles.filtersContainer}>
              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>Пресеты дат</Text>
                <View style={styles.presetRow}>
                  <TouchableOpacity
                    style={styles.presetBtn}
                    onPress={() => applyPreset('today')}
                  >
                    <Text style={styles.presetText}>Сегодня</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.presetBtn}
                    onPress={() => applyPreset('week')}
                  >
                    <Text style={styles.presetText}>Неделя</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.presetBtn}
                    onPress={() => applyPreset('month')}
                  >
                    <Text style={styles.presetText}>Месяц</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>Дата начала</Text>
                <TextInput
                  style={styles.filterInput}
                  value={draftFilters.startDate}
                  onChangeText={(text) => setDraftFilters({ ...draftFilters, startDate: text })}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>Дата конца</Text>
                <TextInput
                  style={styles.filterInput}
                  value={draftFilters.endDate}
                  onChangeText={(text) => setDraftFilters({ ...draftFilters, endDate: text })}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              <View style={styles.filterRow}>
                <Text style={styles.filterLabel}>Статус</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusScroll}>
                  {STATUS_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.statusChip,
                        draftFilters.status === opt.value && styles.statusChipActive,
                      ]}
                      onPress={() => setDraftFilters({ ...draftFilters, status: opt.value })}
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          draftFilters.status === opt.value && styles.statusChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.footerButton} onPress={onClose}>
              <Text style={styles.footerButtonText}>Закрыть</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.footerButton} onPress={handleReset}>
              <Text style={styles.footerButtonText}>Сбросить</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.footerButton, styles.footerButtonPrimary]} onPress={handleApply}>
              <Text style={[styles.footerButtonText, styles.footerButtonTextPrimary]}>Применить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  content: {
    maxHeight: 400,
    padding: 16,
  },
  filtersContainer: {
    gap: 16,
  },
  filterRow: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    alignItems: 'center',
  },
  presetText: {
    fontSize: 14,
    color: '#666',
  },
  statusScroll: {
    flexGrow: 0,
  },
  statusChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    marginRight: 8,
  },
  statusChipActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  statusChipText: {
    fontSize: 14,
    color: '#666',
  },
  statusChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  footerButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
  },
  footerButtonPrimary: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  footerButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  footerButtonTextPrimary: {
    color: '#fff',
  },
});
