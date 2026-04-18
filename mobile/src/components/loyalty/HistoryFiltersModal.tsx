import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '@src/components/PrimaryButton';

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
  // Draft filters (то, что вводится в модалке, не влияет на запросы)
  const [draftFilters, setDraftFilters] = useState({
    clientId: '',
    transactionType: '' as 'earned' | 'spent' | '',
    startDate: '',
    endDate: '',
  });

  // Синхронизируем draftFilters с переданными filters при открытии модалки
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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Заголовок */}
          <View style={styles.header}>
            <Text style={styles.title}>Фильтры истории</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={26} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Контент */}
          <ScrollView style={styles.content}>
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
          </ScrollView>

          {/* Футер с кнопками */}
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
    maxHeight: '80%',
    flex: 1,
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
    flex: 1,
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
