import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from '../PrimaryButton';
import { MasterSettings, ProfileSaveApiError, putMasterProfileFormData } from '@src/services/api/master';
import { birthDateErrorFromMessage } from '@src/utils/apiErrorMessage';
import { getTimezoneByCity } from '@src/data/cities';
import { KeyboardAwareBottomSheet } from '@src/components/common/KeyboardAwareBottomSheet';
import { CityPickerModal } from './CityPickerModal';
import {
  BIRTH_DATE_HELPER,
  BIRTH_DATE_PLACEHOLDER,
  dateToBirthDateDisplay,
  formatBirthDateInput,
  isoToBirthDateDisplay,
  parseBirthDateForApi,
  validateBirthDateDisplay,
} from '@src/utils/birthDateInput';

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
  const [cityPickerVisible, setCityPickerVisible] = useState(false);
  const [birthDatePickerVisible, setBirthDatePickerVisible] = useState(false);

  useEffect(() => {
    if (settings && visible) {
      const birthDateFormatted = isoToBirthDateDisplay(settings.user.birth_date);

      setForm({
        full_name: settings.user.full_name || '',
        phone: settings.user.phone || '',
        email: settings.user.email || '',
        birth_date: birthDateFormatted,
        city: settings.master.city || '',
      });
      setErrors({});
      setSaveSuccess(false);
      setCityPickerVisible(false);
      setBirthDatePickerVisible(false);
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

    if (form.birth_date.trim()) {
      const birthErr = validateBirthDateDisplay(form.birth_date);
      if (birthErr) newErrors.birth_date = birthErr;
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

    let birthIso: string | null = null;
    if (form.birth_date.trim()) {
      birthIso = parseBirthDateForApi(form.birth_date);
      if (!birthIso) {
        setErrors({ birth_date: 'Введите дату в формате ДД.ММ.ГГГГ' });
        return;
      }
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('full_name', form.full_name);
      formData.append('phone', form.phone);
      if (form.email) {
        formData.append('email', form.email);
      }
      if (birthIso) {
        formData.append('birth_date', birthIso);
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
    } catch (err: unknown) {
      if (__DEV__) {
        console.warn('[EditProfileModal] save failed', err);
      }
      const nextErrors: Record<string, string> = {};
      let alertMessage: string | null = null;

      if (err instanceof ProfileSaveApiError) {
        Object.assign(nextErrors, err.fieldErrors);
        const birthFromApi =
          err.fieldErrors.birth_date || birthDateErrorFromMessage(err.message);
        if (birthFromApi) nextErrors.birth_date = birthFromApi;
        const otherKeys = Object.keys(nextErrors).filter((k) => k !== 'birth_date');
        if (otherKeys.length === 0 && !nextErrors.birth_date) {
          alertMessage = err.message;
        } else if (otherKeys.length > 0 && !nextErrors.birth_date) {
          alertMessage = err.message;
        }
      } else if (err instanceof Error) {
        const birthMsg = birthDateErrorFromMessage(err.message);
        if (birthMsg) nextErrors.birth_date = birthMsg;
        else alertMessage = err.message || 'Не удалось сохранить профиль';
      } else {
        alertMessage = 'Не удалось сохранить профиль';
      }

      if (Object.keys(nextErrors).length > 0) setErrors((e) => ({ ...e, ...nextErrors }));
      if (alertMessage) Alert.alert('Ошибка', alertMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <KeyboardAwareBottomSheet
        visible={visible}
        onRequestClose={onClose}
        title="Редактирование профиля"
        footer={
          <>
            {saveSuccess ? (
              <View style={styles.successMessage}>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" style={styles.successIcon} />
                <Text style={styles.successText}>Профиль успешно сохранен</Text>
              </View>
            ) : null}
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
          </>
        }
      >
        <View style={styles.field}>
          <Text style={styles.label}>
            ФИО <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.input, errors.full_name && styles.inputError]}
            value={form.full_name}
            onChangeText={(text) => {
              setForm({ ...form, full_name: text });
              if (errors.full_name) setErrors({ ...errors, full_name: '' });
            }}
            placeholder="Введите ФИО"
          />
          {errors.full_name ? <Text style={styles.errorText}>{errors.full_name}</Text> : null}
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
              if (errors.phone) setErrors({ ...errors, phone: '' });
            }}
            placeholder="+7 (999) 123-45-67"
            keyboardType="phone-pad"
          />
          {errors.phone ? <Text style={styles.errorText}>{errors.phone}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, errors.email && styles.inputError]}
            value={form.email}
            onChangeText={(text) => {
              setForm({ ...form, email: text });
              if (errors.email) setErrors({ ...errors, email: '' });
            }}
            placeholder="example@mail.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Дата рождения</Text>
          <View style={styles.birthDateRow}>
            <TextInput
              style={[styles.input, styles.birthDateInput, errors.birth_date && styles.inputError]}
              value={form.birth_date}
              onChangeText={(text) => {
                setForm({ ...form, birth_date: formatBirthDateInput(text) });
                if (errors.birth_date) setErrors({ ...errors, birth_date: '' });
              }}
              placeholder={BIRTH_DATE_PLACEHOLDER}
              keyboardType="number-pad"
              maxLength={10}
            />
            <TouchableOpacity
              style={styles.calendarBtn}
              onPress={() => setBirthDatePickerVisible(true)}
              accessibilityLabel="Выбрать дату в календаре"
            >
              <Ionicons name="calendar-outline" size={22} color="#4CAF50" />
            </TouchableOpacity>
          </View>
          {birthDatePickerVisible ? (
            <DateTimePicker
              value={
                parseBirthDateForApi(form.birth_date)
                  ? new Date(`${parseBirthDateForApi(form.birth_date)}T12:00:00`)
                  : new Date(1990, 0, 1)
              }
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              minimumDate={new Date(1900, 0, 1)}
              onChange={(event, date) => {
                if (event?.type === 'dismissed') {
                  setBirthDatePickerVisible(false);
                  return;
                }
                if (!date) {
                  if (Platform.OS === 'android') setBirthDatePickerVisible(false);
                  return;
                }
                setForm((f) => ({ ...f, birth_date: dateToBirthDateDisplay(date) }));
                if (errors.birth_date) setErrors((e) => ({ ...e, birth_date: '' }));
                if (Platform.OS === 'android') setBirthDatePickerVisible(false);
              }}
            />
          ) : null}
          <Text style={styles.helperText}>{BIRTH_DATE_HELPER}</Text>
          {errors.birth_date ? <Text style={styles.errorText}>{errors.birth_date}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            Город <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={[styles.cityPickerBtn, errors.city && styles.inputError]}
            onPress={() => setCityPickerVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={form.city ? styles.cityPickerValue : styles.cityPickerPlaceholder}>
              {form.city || 'Выберите город'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#666" />
          </TouchableOpacity>
          {errors.city ? <Text style={styles.errorText}>{errors.city}</Text> : null}
        </View>
      </KeyboardAwareBottomSheet>

      <CityPickerModal
        visible={cityPickerVisible}
        selectedCity={form.city}
        onClose={() => setCityPickerVisible(false)}
        onSelect={(cityName) => {
          setForm((f) => ({ ...f, city: cityName }));
          if (errors.city) setErrors((e) => ({ ...e, city: '' }));
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
  birthDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  birthDateInput: {
    flex: 1,
  },
  calendarBtn: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  cityPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
  },
  cityPickerValue: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  cityPickerPlaceholder: {
    fontSize: 16,
    color: '#999',
    flex: 1,
  },
  helperText: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
  },
  errorText: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 4,
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
