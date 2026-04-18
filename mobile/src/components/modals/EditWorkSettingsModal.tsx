import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TextInput, TouchableOpacity, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../PrimaryButton';
import { MasterSettings, putMasterProfileFormData } from '@src/services/api/master';
interface EditWorkSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  settings: MasterSettings | null;
  onSave: () => void | Promise<void>;
  isSalonFeaturesEnabled?: boolean;
}

export function EditWorkSettingsModal({ 
  visible, 
  onClose, 
  settings, 
  onSave,
  isSalonFeaturesEnabled = false 
}: EditWorkSettingsModalProps) {
  const [form, setForm] = useState({
    can_work_independently: true,
    can_work_in_salon: false,
    auto_confirm_bookings: false,
    bio: '',
    experience_years: '0',
    address: '',
    payment_on_visit: true,
    payment_advance: false,
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (settings && visible) {
      setForm({
        can_work_independently: settings.master.can_work_independently ?? true,
        can_work_in_salon: settings.master.can_work_in_salon ?? false,
        auto_confirm_bookings: settings.master.auto_confirm_bookings ?? false,
        bio: settings.master.bio || '',
        experience_years: String(settings.master.experience_years || 0),
        address: settings.master.address || '',
        payment_on_visit: settings.master.payment_on_visit !== false,
        payment_advance: settings.master.payment_advance || false,
      });
      setErrors({});
      setSaveSuccess(false);
    }
  }, [settings, visible]);

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (form.experience_years && (isNaN(Number(form.experience_years)) || Number(form.experience_years) < 0)) {
      newErrors.experience_years = 'Опыт работы должен быть положительным числом';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('can_work_independently', String(form.can_work_independently));
      formData.append('can_work_in_salon', String(form.can_work_in_salon));
      formData.append('auto_confirm_bookings', String(form.auto_confirm_bookings));
      formData.append('bio', form.bio);
      formData.append('experience_years', form.experience_years);
      if (form.address) {
        formData.append('address', form.address);
      }
      formData.append('payment_on_visit', String(form.payment_on_visit));
      formData.append('payment_advance', String(form.payment_advance));

      await putMasterProfileFormData(formData);

      setSaveSuccess(true);
      setTimeout(() => {
        void (async () => {
          setSaveSuccess(false);
          try {
            await Promise.resolve(onSave());
          } finally {
            onClose();
          }
        })();
      }, 1500);
    } catch (err: any) {
      Alert.alert('Ошибка', err.message || 'Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.container} edges={['bottom']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Настройки работы</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.content} 
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={true}
          >
            <View style={styles.form}>
              <View style={styles.field}>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>Самостоятельная работа</Text>
                  <Switch
                    value={form.can_work_independently}
                    onValueChange={(value) => setForm({ ...form, can_work_independently: value })}
                    disabled={!isSalonFeaturesEnabled}
                  />
                </View>
                {!isSalonFeaturesEnabled && (
                  <Text style={styles.hint}>
                    Мастер работает только индивидуально. Функции работы в салоне отключены в настройках администратора.
                  </Text>
                )}
              </View>

              {isSalonFeaturesEnabled && (
                <View style={styles.field}>
                  <View style={styles.switchRow}>
                    <Text style={styles.label}>Работа в салоне</Text>
                    <Switch
                      value={form.can_work_in_salon}
                      onValueChange={(value) => setForm({ ...form, can_work_in_salon: value })}
                    />
                  </View>
                </View>
              )}

              <View style={styles.field}>
                <Text style={styles.label}>Подтверждение записей</Text>
                <View style={styles.radioGroup}>
                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => setForm({ ...form, auto_confirm_bookings: false })}
                  >
                    <View style={styles.radio}>
                      {!form.auto_confirm_bookings && <View style={styles.radioSelected} />}
                    </View>
                    <Text style={styles.radioLabel}>Вручную</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.radioOption}
                    onPress={() => setForm({ ...form, auto_confirm_bookings: true })}
                  >
                    <View style={styles.radio}>
                      {form.auto_confirm_bookings && <View style={styles.radioSelected} />}
                    </View>
                    <Text style={styles.radioLabel}>Автоматически</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {form.can_work_independently && (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Адрес</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={form.address}
                      onChangeText={(text) => setForm({ ...form, address: text })}
                      placeholder="Укажите ваш адрес"
                      multiline
                      numberOfLines={2}
                    />
                  </View>
                </>
              )}

              <View style={styles.field}>
                <Text style={styles.label}>О себе</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={form.bio}
                  onChangeText={(text) => setForm({ ...form, bio: text })}
                  placeholder="Расскажите о себе и своем опыте..."
                  multiline
                  numberOfLines={4}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Опыт работы (лет)</Text>
                <TextInput
                  style={[styles.input, errors.experience_years && styles.inputError]}
                  value={form.experience_years}
                  onChangeText={(text) => {
                    setForm({ ...form, experience_years: text });
                    if (errors.experience_years) {
                      setErrors({ ...errors, experience_years: '' });
                    }
                  }}
                  placeholder="0"
                  keyboardType="numeric"
                />
                {errors.experience_years && <Text style={styles.errorText}>{errors.experience_years}</Text>}
              </View>

              <View style={styles.field}>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>Оплата при визите</Text>
                  <Switch
                    value={form.payment_on_visit}
                    onValueChange={(value) => setForm({ ...form, payment_on_visit: value })}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>Предоплата</Text>
                  <Switch
                    value={form.payment_advance}
                    onValueChange={(value) => setForm({ ...form, payment_advance: value })}
                  />
                </View>
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {saveSuccess && (
              <View style={styles.successMessage}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" style={styles.successIcon} />
                <Text style={styles.successText}>Настройки успешно сохранены</Text>
              </View>
            )}
            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={onClose}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <PrimaryButton
                title="Сохранить"
                onPress={handleSave}
                loading={saving}
                style={styles.saveButton}
              />
            </View>
          </View>
        </SafeAreaView>
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
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexGrow: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  form: {
    padding: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputError: {
    borderColor: '#F44336',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  radioGroup: {
    marginTop: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4CAF50',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
  },
  radioLabel: {
    fontSize: 16,
    color: '#333',
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  successIcon: {
    marginRight: 8,
  },
  successText: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
  },
});

