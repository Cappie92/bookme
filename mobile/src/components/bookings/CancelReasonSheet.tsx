import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CANCELLATION_REASONS } from '@src/utils/bookingOutcome';
import { PrimaryButton } from '../PrimaryButton';

const REASON_KEYS = ['client_requested', 'client_no_show', 'mutual_agreement', 'master_unavailable'] as const;

interface CancelReasonSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}

export function CancelReasonSheet({ visible, onClose, onConfirm }: CancelReasonSheetProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!selectedReason) return;
    try {
      setLoading(true);
      await onConfirm(selectedReason);
      setSelectedReason(null);
      onClose();
    } catch {
      // ошибка обрабатывается в родителе
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedReason(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Причина отмены</Text>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.reasonsList}>
            {REASON_KEYS.map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.reasonRow, selectedReason === key && styles.reasonRowSelected]}
                onPress={() => setSelectedReason(key)}
                activeOpacity={0.7}
              >
                <View style={[styles.radio, selectedReason === key && styles.radioSelected]}>
                  {selectedReason === key && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.reasonLabel}>{CANCELLATION_REASONS[key]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.actions}>
            <PrimaryButton
              title="Подтвердить отмену"
              onPress={handleConfirm}
              disabled={!selectedReason || loading}
              loading={loading}
              style={styles.primaryBtn}
            />
            <TouchableOpacity
              onPress={handleClose}
              style={styles.secondaryBtn}
              disabled={loading}
            >
              <Text style={styles.secondaryBtnText}>Отмена</Text>
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
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeBtn: {
    padding: 4,
  },
  reasonsList: {
    paddingVertical: 12,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  reasonRowSelected: {
    backgroundColor: '#E8F5E9',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#4CAF50',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
  },
  reasonLabel: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  actions: {
    gap: 12,
    paddingTop: 16,
  },
  primaryBtn: {
    minHeight: 48,
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 16,
    color: '#666',
  },
});
