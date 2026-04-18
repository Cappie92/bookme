import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { createTaxRate, TaxRateResponse } from '@src/services/api/accounting';
import { parseLocalDate } from '@src/utils/date';

interface TaxRateModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentRate?: TaxRateResponse | null;
}

const formatYmd = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatFullDate = (value?: string | null) => {
  if (!value) return '';
  const base = value.slice(0, 10);
  const d = base.includes('-') ? parseLocalDate(base) : new Date(value);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function TaxRateModal({ visible, onClose, onSuccess, currentRate }: TaxRateModalProps) {
  const [rate, setRate] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [recalculateExisting, setRecalculateExisting] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError('');
    setSaving(false);
    setRecalculateExisting(false);
    setRate('');
    setEffectiveDate(formatYmd(new Date()));
  }, [visible]);

  const handleDateChange = (event: any, date?: Date) => {
    if (event?.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }
    if (!date) return;
    setEffectiveDate(formatYmd(date));
    setShowDatePicker(false);
  };

  const handleSubmit = async () => {
    if (saving) return;
    setError('');
    const parsed = parseFloat(rate);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError('Налоговая ставка должна быть от 0 до 100%');
      return;
    }
    if (!effectiveDate) {
      setError('Укажите дату вступления в силу');
      return;
    }

    setSaving(true);
    try {
      await createTaxRate({
        rate: parsed,
        effective_from_date: effectiveDate,
        recalculate_existing: recalculateExisting,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      const status = err?.status;
      if (status === 403) {
        setError('Нет доступа (нужен Pro)');
      } else if (status === 405) {
        setError('Метод не поддерживается. Проверьте адрес запроса.');
      } else if (status === 415) {
        setError('Неподдерживаемый формат запроса.');
      } else if (status === 422) {
        setError('Проверьте заполнение полей и формат даты.');
      } else {
        setError(err?.message || 'Ошибка при сохранении налоговой ставки');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.overlayTouchable} activeOpacity={1} onPress={onClose} />
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Изменить налог</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {currentRate && (
            <View style={styles.currentRateBox}>
              <Text style={styles.currentRateText}>
                Текущая ставка: <Text style={styles.currentRateValue}>{currentRate.rate}%</Text>
                {currentRate.effective_from_date ? ` (с ${formatFullDate(currentRate.effective_from_date)})` : ''}
              </Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Новая ставка налога (%)</Text>
            <TextInput
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              placeholder="0"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Применить с даты</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.dateButtonText}>{effectiveDate || 'Выберите дату'}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={effectiveDate ? parseLocalDate(effectiveDate) : new Date()}
                mode="date"
                display="default"
                onChange={handleDateChange}
              />
            )}
          </View>

          <View style={styles.switchRow}>
            <Switch value={recalculateExisting} onValueChange={setRecalculateExisting} />
            <Text style={styles.switchLabel}>Пересчитать все существующие доходы</Text>
          </View>

          {recalculateExisting && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                При включении этой опции все подтвержденные доходы начиная с указанной даты будут пересчитаны.
              </Text>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.secondaryButton} disabled={saving}>
              <Text style={styles.secondaryButtonText}>Отмена</Text>
            </TouchableOpacity>
            <PrimaryButton
              title={saving ? 'Сохранение...' : 'Сохранить'}
              onPress={handleSubmit}
              disabled={saving}
              style={styles.primaryButton}
            />
          </View>

          {saving && (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color="#4CAF50" />
              <Text style={styles.savingText}>Сохранение…</Text>
            </View>
          )}
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
  overlayTouchable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  currentRateBox: {
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  currentRateText: {
    fontSize: 12,
    color: '#555',
  },
  currentRateValue: {
    fontWeight: '700',
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#333',
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateButtonText: {
    fontSize: 14,
    color: '#333',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  switchLabel: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  warningBox: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 12,
    color: '#8D6E63',
  },
  errorText: {
    fontSize: 12,
    color: '#C62828',
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    color: '#555',
  },
  primaryButton: {
    flex: 1,
  },
  savingRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  savingText: {
    fontSize: 12,
    color: '#666',
  },
});
