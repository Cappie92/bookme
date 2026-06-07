import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareBottomSheet } from '@src/components/common/KeyboardAwareBottomSheet';

interface HistoryFiltersModalProps {
  visible: boolean;
  onClose: () => void;
  filters: {
    clientId: string;
    transactionType: 'earned' | 'spent' | '';
    startDate: string;
    endDate: string;
  };
  onApply: (filters: {
    clientId: string;
    transactionType: 'earned' | 'spent' | '';
    startDate: string;
    endDate: string;
  }) => void;
  onReset: () => void;
}

export function HistoryFiltersModal({
  visible,
  onClose,
  filters,
  onApply,
  onReset,
}: HistoryFiltersModalProps) {
  const [draftFilters, setDraftFilters] = useState({
    clientId: '',
    transactionType: '' as 'earned' | 'spent' | '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    if (visible) {
      setDraftFilters({
        clientId: filters.clientId || '',
        transactionType: filters.transactionType || '',
        startDate: filters.startDate || '',
        endDate: filters.endDate || '',
      });
    }
  }, [visible, filters]);

  const handleApply = () => {
    onApply(draftFilters);
    onClose();
  };

  const handleReset = () => {
    const emptyFilters = {
      clientId: '',
      transactionType: '' as 'earned' | 'spent' | '',
      startDate: '',
      endDate: '',
    };
    setDraftFilters(emptyFilters);
    onReset();
    onClose();
  };

  return (
    <KeyboardAwareBottomSheet
      visible={visible}
      onRequestClose={onClose}
      footer={
        <View style={styles.footerRow}>
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
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Фильтры истории</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={26} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.filtersContainer}>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Клиент (ID)</Text>
          <TextInput
            style={styles.filterInput}
            value={draftFilters.clientId}
            onChangeText={(text) => setDraftFilters({ ...draftFilters, clientId: text })}
            placeholder="ID клиента"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Тип операции</Text>
          <View style={styles.filterSelectContainer}>
            <TouchableOpacity
              style={[
                styles.filterSelectOption,
                draftFilters.transactionType === '' && styles.filterSelectOptionActive,
              ]}
              onPress={() => setDraftFilters({ ...draftFilters, transactionType: '' })}
            >
              <Text
                style={[
                  styles.filterSelectText,
                  draftFilters.transactionType === '' && styles.filterSelectTextActive,
                ]}
              >
                Все
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterSelectOption,
                draftFilters.transactionType === 'earned' && styles.filterSelectOptionActive,
              ]}
              onPress={() => setDraftFilters({ ...draftFilters, transactionType: 'earned' })}
            >
              <Text
                style={[
                  styles.filterSelectText,
                  draftFilters.transactionType === 'earned' && styles.filterSelectTextActive,
                ]}
              >
                Начисление
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.filterSelectOption,
                draftFilters.transactionType === 'spent' && styles.filterSelectOptionActive,
              ]}
              onPress={() => setDraftFilters({ ...draftFilters, transactionType: 'spent' })}
            >
              <Text
                style={[
                  styles.filterSelectText,
                  draftFilters.transactionType === 'spent' && styles.filterSelectTextActive,
                ]}
              >
                Списание
              </Text>
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
      </View>
    </KeyboardAwareBottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  filtersContainer: {
    gap: 8,
  },
  filterRow: {
    marginBottom: 12,
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
  filterSelectContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterSelectOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    alignItems: 'center',
  },
  filterSelectOptionActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  filterSelectText: {
    fontSize: 14,
    color: '#666',
  },
  filterSelectTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
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
