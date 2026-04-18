import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../PrimaryButton';
import { MasterSettings, putMasterProfileFormData } from '@src/services/api/master';
import { getTimezoneByCity } from '@src/data/cities';

// Список городов (можно расширить)
const CITIES = [
  'Москва',
  'Санкт-Петербург',
  'Новосибирск',
  'Екатеринбург',
  'Казань',
  'Нижний Новгород',
  'Челябинск',
  'Самара',
  'Омск',
  'Ростов-на-Дону',
  'Уфа',
  'Красноярск',
  'Воронеж',
  'Пермь',
  'Волгоград',
  'Краснодар',
  'Саратов',
  'Тюмень',
  'Тольятти',
  'Ижевск',
];

interface EditProfileModalProps {
  visible: boolean;
  onClose: () => void;
  settings: MasterSettings | null;
  onSave: () => void | Promise<void>;
}

export function EditProfileModal({ visible, onClose, settings, onSave }: EditProfileModalProps) {
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    birth_date: '',
    city: '',
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (settings && visible) {
      // Форматируем дату для input type="date" (YYYY-MM-DD)
      let birthDateFormatted = '';
      if (settings.user.birth_date) {
        try {
          const date = new Date(settings.user.birth_date);
          birthDateFormatted = date.toISOString().split('T')[0];
        } catch {
          birthDateFormatted = '';
        }
      }
      
      setForm({
        full_name: settings.user.full_name || '',
        phone: settings.user.phone || '',
        email: settings.user.email || '',
        birth_date: birthDateFormatted,
        city: settings.master.city || '',
      });
      setErrors({});
      setSaveSuccess(false);
    }
  }, [settings, visible]);

  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!form.full_name || form.full_name.trim().length === 0) {
      newErrors.full_name = 'ФИО обязательно для заполнения';
    }

    if (!form.phone || form.phone.trim().length === 0) {
      newErrors.phone = 'Телефон обязателен для заполнения';
    } else if (!/^\+?[1-9]\d{9,14}$/.test(form.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Неверный формат телефона';
    }

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Неверный формат email';
    }

    if (!form.city || form.city.trim().length === 0) {
      newErrors.city = 'Город обязателен для заполнения';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }
    const cityTrimmed = form.city?.trim();
    if (!cityTrimmed) {
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('full_name', form.full_name);
      formData.append('phone', form.phone);
      if (form.email) {
        formData.append('email', form.email);
      }
      if (form.birth_date) {
        formData.append('birth_date', form.birth_date);
      }
      formData.append('city', cityTrimmed);
      formData.append('timezone', getTimezoneByCity(cityTrimmed));

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
      Alert.alert('Ошибка', err.message || 'Не удалось сохранить профиль');
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
            <Text style={styles.headerTitle}>Редактирование профиля</Text>
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
                <Text style={styles.label}>
                  ФИО <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, errors.full_name && styles.inputError]}
                  value={form.full_name}
                  onChangeText={(text) => {
                    setForm({ ...form, full_name: text });
                    if (errors.full_name) {
                      setErrors({ ...errors, full_name: '' });
                    }
                  }}
                  placeholder="Введите ФИО"
                />
                {errors.full_name && <Text style={styles.errorText}>{errors.full_name}</Text>}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Телефон <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={[styles.input, errors.phone && styles.inputError]}
                  value={form.phone}
                  onChangeText={(text) => {
                    setForm({ ...form, phone: text });
                    if (errors.phone) {
                      setErrors({ ...errors, phone: '' });
                    }
                  }}
                  placeholder="+7 (999) 123-45-67"
                  keyboardType="phone-pad"
                />
                {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  value={form.email}
                  onChangeText={(text) => {
                    setForm({ ...form, email: text });
                    if (errors.email) {
                      setErrors({ ...errors, email: '' });
                    }
                  }}
                  placeholder="example@mail.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Дата рождения</Text>
                <TextInput
                  style={styles.input}
                  value={form.birth_date}
                  onChangeText={(text) => setForm({ ...form, birth_date: text })}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Город <Text style={styles.required}>*</Text>
                </Text>
                <ScrollView style={styles.cityList} nestedScrollEnabled>
                  {CITIES.map((city) => (
                    <TouchableOpacity
                      key={city}
                      style={[
                        styles.cityOption,
                        form.city === city && styles.cityOptionSelected,
                      ]}
                      onPress={() => {
                        setForm({ ...form, city });
                        if (errors.city) {
                          setErrors({ ...errors, city: '' });
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.cityOptionText,
                          form.city === city && styles.cityOptionTextSelected,
                        ]}
                      >
                        {city}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {form.city && (
                  <View style={styles.selectedCity}>
                    <Text style={styles.selectedCityText}>Выбрано: {form.city}</Text>
                  </View>
                )}
                {errors.city && <Text style={styles.errorText}>{errors.city}</Text>}
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {saveSuccess && (
              <View style={styles.successMessage}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" style={styles.successIcon} />
                <Text style={styles.successText}>Профиль успешно сохранен</Text>
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
                disabled={!form.city?.trim()}
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
  required: {
    color: '#F44336',
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
  errorText: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 4,
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
  cityList: {
    maxHeight: 150,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  cityOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cityOptionSelected: {
    backgroundColor: '#E8F5E9',
  },
  cityOptionText: {
    fontSize: 16,
    color: '#333',
  },
  cityOptionTextSelected: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  selectedCity: {
    marginTop: 8,
    padding: 8,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
  },
  selectedCityText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
});

