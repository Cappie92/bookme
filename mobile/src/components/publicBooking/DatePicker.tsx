/**
 * DatePicker — выбор даты из списка дат, где есть слоты.
 * Даты приходят из availability (сгруппированы по start_time).
 */
import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDateForPicker } from '@src/utils/format';

export interface DateOption {
  dateStr: string; // YYYY-MM-DD
  displayLabel: string; // "Сегодня", "Завтра", "28.02, Пн"
}

interface DatePickerProps {
  visible: boolean;
  onClose: () => void;
  dates: DateOption[];
  selectedDate: string | null;
  onSelect: (dateStr: string) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function DatePicker({
  visible,
  onClose,
  dates,
  selectedDate,
  onSelect,
  loading,
  error,
  onRetry,
}: DatePickerProps) {
  const handleSelect = (dateStr: string) => {
    onSelect(dateStr);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Выберите дату</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.loadingText}>Загрузка доступных дат...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
              {onRetry && (
                <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
                  <Text style={styles.retryBtnText}>Повторить</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : dates.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Нет доступных дат на ближайшие 14 дней</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
              {dates.map((opt) => (
                <TouchableOpacity
                  key={opt.dateStr}
                  style={[
                    styles.dateRow,
                    selectedDate === opt.dateStr && styles.dateRowSelected,
                  ]}
                  onPress={() => handleSelect(opt.dateStr)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dateLabel}>{opt.displayLabel}</Text>
                  {selectedDate === opt.dateStr && (
                    <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function buildDateOptionsFromSlots(
  slots: { start_time: string }[],
  masterTimezone?: string
): DateOption[] {
  const seen = new Set<string>();
  const result: DateOption[] = [];
  for (const s of slots) {
    const dateStr = s.start_time.slice(0, 10);
    if (seen.has(dateStr)) continue;
    seen.add(dateStr);
    result.push({
      dateStr,
      displayLabel: formatDateForPicker(dateStr),
    });
  }
  result.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  return result;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  loadingWrap: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  errorWrap: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#c00',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
  },
  scroll: {
    padding: 16,
    paddingBottom: 24,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dateRowSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#e8f5e9',
  },
  dateLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
});
