import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { PrimaryButton } from '@src/components/PrimaryButton';
import { parseLocalDate } from '@src/utils/date';
import {
  AccountingOperation,
  createExpense,
  getMasterServices,
  Service,
  updateExpense,
} from '@src/services/api/accounting';

interface ExpenseModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  expense?: AccountingOperation | null;
  expenseId?: number | null;
}

type ExpenseType = 'one_time' | 'recurring' | 'service_based';
type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'conditional';
type ConditionType = 'has_bookings' | 'schedule_open';

const formatYmd = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const defaultExpenseDate = formatYmd(new Date());

export function ExpenseModal({ visible, onClose, onSuccess, expense, expenseId }: ExpenseModalProps) {
  const [name, setName] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType>('one_time');
  const [amount, setAmount] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('monthly');
  const [conditionType, setConditionType] = useState<ConditionType>('has_bookings');
  const [serviceId, setServiceId] = useState('');
  const [expenseDate, setExpenseDate] = useState(defaultExpenseDate);

  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const servicesReqIdRef = useRef(0);

  const hasServices = services.length > 0;

  useEffect(() => {
    if (!visible) return;
    const reqId = ++servicesReqIdRef.current;
    setServicesLoading(true);
    getMasterServices()
      .then((data) => {
        if (reqId !== servicesReqIdRef.current) return;
        setServices(data || []);
      })
      .catch((err) => {
        if (reqId !== servicesReqIdRef.current) return;
        console.error('Ошибка при загрузке услуг:', err);
      })
      .finally(() => {
        if (reqId !== servicesReqIdRef.current) return;
        setServicesLoading(false);
      });
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setError('');
    setFieldErrors({});
    setSaving(false);
    if (expense) {
      setName(expense.name || '');
      setAmount(Math.abs(Number(expense.amount) || 0).toString());
      setExpenseType((expense as any).expense_type || 'one_time');
      setRecurrenceType((expense as any).recurrence_type || 'monthly');
      setConditionType((expense as any).condition_type || 'has_bookings');
      setServiceId((expense as any).service_id ? String((expense as any).service_id) : '');
      const dateSource = (expense as any).expense_date || expense.date;
      const ymd = dateSource ? String(dateSource).slice(0, 10) : defaultExpenseDate;
      setExpenseDate(ymd);
    } else {
      setName('');
      setAmount('');
      setExpenseType('one_time');
      setRecurrenceType('monthly');
      setConditionType('has_bookings');
      setServiceId('');
      setExpenseDate(defaultExpenseDate);
    }
  }, [visible, expense]);

  const handleDateChange = (event: any, date?: Date) => {
    if (event?.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }
    if (!date) return;
    setExpenseDate(formatYmd(date));
    setShowDatePicker(false);
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    const trimmedName = name.trim();
    const amountValue = parseFloat(amount);

    if (!trimmedName) nextErrors.name = 'Введите название';
    if (!Number.isFinite(amountValue) || amountValue <= 0) nextErrors.amount = 'Укажите сумму больше 0';

    if (expenseType === 'one_time' && !expenseDate) {
      nextErrors.expense_date = 'Выберите дату';
    }

    if (expenseType === 'recurring') {
      if (!recurrenceType) nextErrors.recurrence_type = 'Выберите тип цикла';
      if (recurrenceType === 'conditional' && !conditionType) {
        nextErrors.condition_type = 'Выберите условие';
      }
    }

    if (expenseType === 'service_based') {
      if (!serviceId) nextErrors.service_id = 'Выберите услугу';
      if (!hasServices) nextErrors.service_id = 'Нет услуг для выбора';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setError('');
    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        expense_type: expenseType,
        amount: parseFloat(amount),
      };

      if (expenseType === 'recurring') {
        payload.recurrence_type = recurrenceType;
        if (recurrenceType === 'conditional') {
          payload.condition_type = conditionType;
        }
      }

      if (expenseType === 'service_based') {
        payload.service_id = parseInt(serviceId, 10);
      }

      if (expenseType === 'one_time') {
        payload.expense_date = expenseDate;
      }

      if (expenseId) {
        const status = await updateExpense(expenseId, payload);
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('🧾 [FINANCE API] expenses.update SUCCESS', status);
        }
      } else {
        const status = await createExpense(payload);
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('🧾 [FINANCE API] expenses.create SUCCESS', status);
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('🧾 [FINANCE API] expenses.error', {
          status: err?.status,
          message: err?.message,
        });
      }
      const status = err?.status;
      if (status === 403) {
        setError('Нет доступа (нужен Pro)');
        Alert.alert('Ошибка', 'Нет доступа (нужен Pro)');
      } else if (status === 404) {
        setError('Расход не найден');
        Alert.alert('Ошибка', 'Расход не найден');
      } else if (status >= 500) {
        setError('Ошибка сервера. Попробуйте позже.');
        Alert.alert('Ошибка', 'Ошибка сервера. Попробуйте позже.');
      } else {
        const message = err?.message || 'Произошла ошибка';
        setError(message);
        Alert.alert('Ошибка', message);
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
            <Text style={styles.title}>{expense ? 'Редактировать расход' : 'Добавить расход'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.field}>
              <Text style={styles.label}>Название расхода *</Text>
              <TextInput
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: '' });
                }}
                style={styles.input}
                placeholder="Название"
              />
              {fieldErrors.name ? <Text style={styles.fieldError}>{fieldErrors.name}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Тип расхода *</Text>
              <View style={styles.chipRow}>
                {(['one_time', 'recurring', 'service_based'] as ExpenseType[]).map((t) => {
                  const label = t === 'one_time' ? 'Разовый' : t === 'recurring' ? 'Циклический' : 'По услуге';
                  const disabled = t === 'service_based' && !hasServices && !servicesLoading;
                  const active = expenseType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => {
                        if (disabled) return;
                        setExpenseType(t);
                        if (fieldErrors.expense_type) setFieldErrors({ ...fieldErrors, expense_type: '' });
                      }}
                      style={[
                        styles.chip,
                        active && styles.chipActive,
                        disabled && styles.chipDisabled,
                      ]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!hasServices && expenseType === 'service_based' ? (
                <Text style={styles.hintText}>Нет услуг для выбора</Text>
              ) : null}
            </View>

            {expenseType === 'recurring' && (
              <View style={styles.field}>
                <Text style={styles.label}>Тип цикла *</Text>
                <View style={styles.chipRow}>
                  {(['daily', 'weekly', 'monthly', 'conditional'] as RecurrenceType[]).map((t) => {
                    const label = t === 'daily' ? 'Ежедневно' : t === 'weekly' ? 'Еженедельно' : t === 'monthly' ? 'Ежемесячно' : 'Условный';
                    const active = recurrenceType === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => {
                          setRecurrenceType(t);
                          if (fieldErrors.recurrence_type) setFieldErrors({ ...fieldErrors, recurrence_type: '' });
                        }}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {fieldErrors.recurrence_type ? (
                  <Text style={styles.fieldError}>{fieldErrors.recurrence_type}</Text>
                ) : null}
              </View>
            )}

            {expenseType === 'recurring' && recurrenceType === 'conditional' && (
              <View style={styles.field}>
                <Text style={styles.label}>Условие *</Text>
                <View style={styles.chipRow}>
                  {(['has_bookings', 'schedule_open'] as ConditionType[]).map((t) => {
                    const label = t === 'has_bookings' ? 'День с записями' : 'Расписание открыто';
                    const active = conditionType === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => {
                          setConditionType(t);
                          if (fieldErrors.condition_type) setFieldErrors({ ...fieldErrors, condition_type: '' });
                        }}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {fieldErrors.condition_type ? (
                  <Text style={styles.fieldError}>{fieldErrors.condition_type}</Text>
                ) : null}
              </View>
            )}

            {expenseType === 'service_based' && (
              <View style={styles.field}>
                <Text style={styles.label}>Услуга *</Text>
                <View style={styles.chipRow}>
                  {services.map((service) => {
                    const active = serviceId === String(service.id);
                    return (
                      <TouchableOpacity
                        key={service.id}
                        onPress={() => {
                          setServiceId(String(service.id));
                          if (fieldErrors.service_id) setFieldErrors({ ...fieldErrors, service_id: '' });
                        }}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {service.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {!hasServices && !servicesLoading ? (
                  <Text style={styles.hintText}>Нет услуг для выбора</Text>
                ) : null}
                {fieldErrors.service_id ? <Text style={styles.fieldError}>{fieldErrors.service_id}</Text> : null}
              </View>
            )}

            {expenseType === 'one_time' && (
              <View style={styles.field}>
                <Text style={styles.label}>Дата расхода *</Text>
                <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.dateButtonText}>{expenseDate || 'Выберите дату'}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={expenseDate ? parseLocalDate(expenseDate) : new Date()}
                    mode="date"
                    display="default"
                    onChange={handleDateChange}
                  />
                )}
                {fieldErrors.expense_date ? <Text style={styles.fieldError}>{fieldErrors.expense_date}</Text> : null}
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Стоимость (₽) *</Text>
              <TextInput
                value={amount}
                onChangeText={(text) => {
                  setAmount(text);
                  if (fieldErrors.amount) setFieldErrors({ ...fieldErrors, amount: '' });
                }}
                keyboardType="decimal-pad"
                style={styles.input}
                placeholder="0"
              />
              {fieldErrors.amount ? <Text style={styles.fieldError}>{fieldErrors.amount}</Text> : null}
            </View>
          </ScrollView>

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
    maxHeight: '85%',
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
  },
  chipActive: {
    backgroundColor: '#4CAF50',
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: 12,
    color: '#666',
  },
  chipTextActive: {
    color: '#fff',
  },
  hintText: {
    fontSize: 11,
    color: '#999',
    marginTop: 6,
  },
  fieldError: {
    fontSize: 11,
    color: '#C62828',
    marginTop: 4,
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
    marginTop: 12,
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
