import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, TextInput, Alert, Platform, Dimensions, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createScheduleRule, ScheduleRule } from '@src/services/api/master';
// TODO: remove probe after verification
import { runDateParsingProbe } from '@src/debug/dateParsingProbe';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface RuleBuilderModalProps {
  visible: boolean;
  onClose: () => void;
  onPreview?: (rule: Partial<ScheduleRule>) => void;
  weekDates?: Date[];
  onRuleCreated?: () => void;
}

// Функции форматирования даты
const formatDateToDisplay = (date: Date | null): string => {
  if (!date) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

const parseDateFromDisplay = (dateString: string): Date | null => {
  if (!dateString) return null;
  const parts = dateString.split('-');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  // Используем new Date(year, month, day) - это безопасно, создаёт локальную дату
  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) return null;
  return date;
};

// TODO: Если в будущем понадобится парсить даты из API (например, при предзаполнении формы
// из fixed_schedule.effectiveStartDate или fixed_schedule.validUntil в формате YYYY-MM-DD),
// использовать parseLocalDate() из @src/utils/date вместо new Date(dateString)
// Пример: const validUntilDate = parseLocalDate(rule.validUntil);

const formatDateToAPI = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const WARNING_HIDDEN_KEY = 'schedule_warning_hidden';

export function RuleBuilderModal({ visible, onClose, onPreview, weekDates = [], onRuleCreated }: RuleBuilderModalProps) {
  const insets = useSafeAreaInsets();
  const [scheduleType, setScheduleType] = useState<'weekdays' | 'monthdays' | 'shift'>('weekdays');
  const [validUntil, setValidUntil] = useState<Date | null>(null);
  const [validUntilDisplay, setValidUntilDisplay] = useState('');
  const [weekdays, setWeekdays] = useState<{ [key: string]: { start: string; end: string } }>({});
  const [monthdays, setMonthdays] = useState<{ [key: string]: { start: string; end: string } }>({});
  const [shiftConfig, setShiftConfig] = useState({ 
    workDays: 2, 
    restDays: 1, 
    startDate: null as Date | null,
    workStartTime: '09:00',
    workEndTime: '18:00',
  });
  const [shiftConfigDisplay, setShiftConfigDisplay] = useState({ startDate: '' });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [effectiveStartDate, setEffectiveStartDate] = useState<Date | null>(null);
  const [effectiveStartDateDisplay, setEffectiveStartDateDisplay] = useState('');
  const [warningHidden, setWarningHidden] = useState(false);

  // Единый state для всех пикеров
  type PickerKind = 'date' | 'time';
  type PickerKey =
    | 'validUntil'
    | 'shiftStartDate'
    | 'weekdaysStartDate'
    | 'monthdaysStartDate'
    | `weekday_start_${number}`
    | `weekday_end_${number}`
    | `monthday_start_${number}`
    | `monthday_end_${number}`
    | 'workStartTime'
    | 'workEndTime';

  const [pickerState, setPickerState] = useState<{
    open: boolean;
    kind: PickerKind | null;
    key: PickerKey | null;
  }>({ open: false, kind: null, key: null });

  /** Снимок активного пикера для onChange нативного DateTimePicker (Android), где замыкание может отставать от state. */
  const pickerSessionRef = useRef<{ key: PickerKey | null; kind: PickerKind | null }>({
    key: null,
    kind: null,
  });

  const [tempPickerDate, setTempPickerDate] = useState<Date>(new Date());

  // TODO: remove probe after verification
  React.useEffect(() => {
    if (__DEV__) {
      runDateParsingProbe();
    }
  }, []);

  // Загрузка состояния предупреждения и сброс DatePicker
  React.useEffect(() => {
    const loadWarningState = async () => {
      try {
        const hidden = await AsyncStorage.getItem(WARNING_HIDDEN_KEY);
        if (hidden === 'true') {
          setWarningHidden(true);
        } else {
          setWarningHidden(false);
        }
      } catch (error) {
        console.error('Ошибка загрузки состояния предупреждения:', error);
      }
    };
    if (visible) {
      loadWarningState();
      // Сбрасываем picker при открытии модального окна
      closePicker();
    }
  }, [visible]);

  const handleHideWarning = async () => {
    try {
      await AsyncStorage.setItem(WARNING_HIDDEN_KEY, 'true');
      setWarningHidden(true);
    } catch (error) {
      console.error('Ошибка сохранения состояния предупреждения:', error);
    }
  };

  const weekDays = [
    { id: 1, name: 'Пн' },
    { id: 2, name: 'Вт' },
    { id: 3, name: 'Ср' },
    { id: 4, name: 'Чт' },
    { id: 5, name: 'Пт' },
    { id: 6, name: 'Сб' },
    { id: 7, name: 'Вс' },
  ];

  // Очистка ошибки поля
  const clearFieldError = (key: string) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[key];
      return newErrors;
    });
  };

  const validateRule = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!scheduleType) {
      newErrors.scheduleType = 'Выберите тип расписания';
    }

    // effectiveStartDate обязателен для всех типов
    if (scheduleType === 'shift') {
      if (!shiftConfig.startDate) {
        newErrors.startDate = 'Укажите дату начала';
      } else if (!(shiftConfig.startDate instanceof Date) || isNaN(shiftConfig.startDate.getTime())) {
        newErrors.startDate = 'Некорректная дата';
      }
    } else {
      if (!effectiveStartDate) {
        newErrors.effectiveStartDate = 'Укажите дату начала действия расписания';
      } else if (!(effectiveStartDate instanceof Date) || isNaN(effectiveStartDate.getTime())) {
        newErrors.effectiveStartDate = 'Некорректная дата';
      }
    }

    if (!validUntil) {
      newErrors.validUntil = 'Укажите дату окончания';
    } else {
      if (!(validUntil instanceof Date) || isNaN(validUntil.getTime())) {
        newErrors.validUntil = 'Некорректная дата';
      }
    }

    // Валидация: effectiveStartDate <= validUntil
    const stripTime = (date: Date): Date => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const startDate = scheduleType === 'shift' ? shiftConfig.startDate : effectiveStartDate;
    if (startDate && validUntil) {
      const start = stripTime(startDate);
      const end = stripTime(validUntil);
      if (start > end) {
        // Дублируем ошибку у обоих полей для лучшего UX
        const errorMessage = 'Дата начала не может быть позже даты окончания';
        if (scheduleType === 'shift') {
          newErrors.startDate = errorMessage;
        } else {
          newErrors.effectiveStartDate = errorMessage;
        }
        newErrors.validUntil = errorMessage;
      }
    }

    // Валидация времени: ночные смены разрешены (start > end), но start === end запрещено
    const parseTimeToMinutes = (timeStr: string): number => {
      const [hh, mm] = (timeStr || '').split(':').map(Number);
      return (hh || 0) * 60 + (mm || 0);
    };

    if (scheduleType === 'weekdays') {
      if (Object.keys(weekdays).length === 0) {
        newErrors.weekdays = 'Выберите хотя бы один день недели';
      } else {
        // Валидация времени для каждого выбранного дня
        Object.entries(weekdays).forEach(([dayId, times]) => {
          if (!times.start || !times.end) {
            newErrors[`weekday_time_${dayId}`] = 'Укажите время начала и окончания';
            return;
          }
          const startMinutes = parseTimeToMinutes(times.start);
          const endMinutes = parseTimeToMinutes(times.end);
          // Запрещено start === end, но разрешено start > end (ночная смена)
          if (startMinutes === endMinutes) {
            newErrors[`weekday_time_${dayId}`] = 'Время начала и окончания не могут совпадать';
          }
        });
      }
    }

    if (scheduleType === 'monthdays') {
      if (Object.keys(monthdays).length === 0) {
        newErrors.monthdays = 'Выберите хотя бы одно число месяца';
      } else {
        // Валидация времени для каждого выбранного числа
        Object.entries(monthdays).forEach(([day, times]) => {
          if (!times.start || !times.end) {
            newErrors[`monthday_time_${day}`] = 'Укажите время начала и окончания';
            return;
          }
          const startMinutes = parseTimeToMinutes(times.start);
          const endMinutes = parseTimeToMinutes(times.end);
          // Запрещено start === end, но разрешено start > end (ночная смена)
          if (startMinutes === endMinutes) {
            newErrors[`monthday_time_${day}`] = 'Время начала и окончания не могут совпадать';
          }
        });
      }
    }

    if (scheduleType === 'shift') {
      if (!shiftConfig.workDays || shiftConfig.workDays < 1) {
        newErrors.workDays = 'Количество рабочих дней должно быть больше 0';
      }
      if (!shiftConfig.restDays || shiftConfig.restDays < 0) {
        newErrors.restDays = 'Количество нерабочих дней не может быть отрицательным';
      }
      // Валидация времени для сменного графика
      if (!shiftConfig.workStartTime || !shiftConfig.workEndTime) {
        newErrors.workTime = 'Укажите время начала и окончания рабочего дня';
      } else {
        const startMinutes = parseTimeToMinutes(shiftConfig.workStartTime);
        const endMinutes = parseTimeToMinutes(shiftConfig.workEndTime);
        // Запрещено start === end, но разрешено start > end (ночная смена)
        if (startMinutes === endMinutes) {
          newErrors.workTime = 'Время начала и окончания не могут совпадать';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateRule()) return;

    try {
      // Определяем effective_start_date в зависимости от типа расписания
      const effectiveStartDateForAPI = scheduleType === 'shift' 
        ? shiftConfig.startDate 
        : effectiveStartDate;

      if (!effectiveStartDateForAPI || !validUntil) {
        Alert.alert('Ошибка', 'Заполните все обязательные поля');
        return;
      }

      // Проверка обрезки ночной смены
      // ВРЕМЕННЫЕ ЛОГИ ДЛЯ ДИАГНОСТИКИ (удалить после проверки)
      const truncateCheck = willTruncateNightShift();
      const hasNightShift = scheduleType === 'weekdays' 
        ? Object.values(weekdays).some(times => isNightShift(times.start, times.end))
        : scheduleType === 'monthdays'
        ? Object.values(monthdays).some(times => isNightShift(times.start, times.end))
        : isNightShift(shiftConfig.workStartTime, shiftConfig.workEndTime);
      
      const nightShiftDays = scheduleType === 'weekdays'
        ? Object.entries(weekdays)
            .filter(([_, times]) => isNightShift(times.start, times.end))
            .map(([id, _]) => id)
        : scheduleType === 'monthdays'
        ? Object.entries(monthdays)
            .filter(([_, times]) => isNightShift(times.start, times.end))
            .map(([day, _]) => day)
        : [];

      console.log('🔍 [NIGHT SHIFT CHECK] scheduleType:', scheduleType);
      console.log('🔍 [NIGHT SHIFT CHECK] effectiveStartDate:', formatDateToDisplay(effectiveStartDateForAPI));
      console.log('🔍 [NIGHT SHIFT CHECK] validUntil:', formatDateToDisplay(validUntil));
      console.log('🔍 [NIGHT SHIFT CHECK] hasNightShift:', hasNightShift);
      console.log('🔍 [NIGHT SHIFT CHECK] nightShiftDays:', nightShiftDays);
      console.log('🔍 [NIGHT SHIFT CHECK] willTruncate:', truncateCheck.willTruncate);
      console.log('🔍 [NIGHT SHIFT CHECK] reason:', truncateCheck.reason);

      // Проверка на обрезку ночной смены
      if (truncateCheck.willTruncate) {
        const validUntilFormatted = formatDateToDisplay(validUntil);
        const confirm = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Обрезка ночной смены',
            `Ночная смена пересекает полночь. Поскольку правило действует до ${validUntilFormatted}, часть смены после 00:00 для даты ${validUntilFormatted} не будет добавлена в расписание. Продолжить?`,
            [
              {
                text: 'Вернуться',
                style: 'cancel',
                onPress: () => resolve(false),
              },
              {
                text: 'Сохранить',
                style: 'default',
                onPress: () => resolve(true),
              },
            ],
            { cancelable: true }
          );
        });

        if (!confirm) {
          return; // Пользователь отменил сохранение
        }
      }

      const ruleData: any = {
        type: scheduleType,
        effective_start_date: formatDateToAPI(effectiveStartDateForAPI),
        valid_until: formatDateToAPI(validUntil),
      };

      if (scheduleType === 'weekdays') {
        ruleData.weekdays = weekdays;
      } else if (scheduleType === 'monthdays') {
        ruleData.monthdays = monthdays;
      } else if (scheduleType === 'shift') {
        ruleData.shiftConfig = {
          workDays: shiftConfig.workDays,
          restDays: shiftConfig.restDays,
          workStartTime: shiftConfig.workStartTime,
          workEndTime: shiftConfig.workEndTime,
        };
      }

      const result = await createScheduleRule(ruleData);
      
      Alert.alert(
        'Успех',
        `Расписание создано! Создано слотов: ${result.slots_created || 0}`,
        [{ text: 'OK', onPress: () => {
          onClose();
          if (onRuleCreated) {
            onRuleCreated();
          }
        }}]
      );
    } catch (error: any) {
      Alert.alert('Ошибка', error.message || 'Не удалось создать расписание');
    }
  };


  // Helper-методы для работы с пикерами
  // Генерация списка 30-минутных интервалов (00:00 - 23:30)
  const TIME_INTERVALS = Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2);
    const minutes = (i % 2) * 30;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  });

  const parseTimeToDate = (time?: string): Date => {
    const d = new Date();
    const [hh, mm] = (time ?? '09:00').split(':').map(Number);
    d.setHours(isNaN(hh) ? 9 : hh, isNaN(mm) ? 0 : mm, 0, 0);
    return d;
  };

  const formatDateToTime = (d: Date): string => {
    // Округляем до ближайшего 30-минутного интервала
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const roundedMinutes = minutes < 30 ? 0 : 30;
    return `${String(hours).padStart(2, '0')}:${String(roundedMinutes).padStart(2, '0')}`;
  };

  // Проверка ночной смены (start > end)
  const isNightShift = (startTime: string, endTime: string): boolean => {
    if (!startTime || !endTime) return false;
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    return startMinutes > endMinutes;
  };

  // Проверка, будет ли ночная смена обрезана validUntil
  // Возвращает { willTruncate: boolean, reason: string }
  const willTruncateNightShift = (): { willTruncate: boolean; reason: string } => {
    if (!validUntil) {
      return { willTruncate: false, reason: 'validUntil не установлен' };
    }

    // Для weekdays
    if (scheduleType === 'weekdays') {
      if (!effectiveStartDate) {
        return { willTruncate: false, reason: 'effectiveStartDate не установлен' };
      }

      // Получаем день недели validUntil (0=воскресенье, 1=понедельник, ..., 6=суббота)
      // В нашей системе: 1=понедельник, 2=вторник, ..., 7=воскресенье
      const validUntilDayOfWeek = validUntil.getDay(); // 0=воскресенье, 1=понедельник, ..., 6=суббота
      // Конвертируем в нашу систему: 1=понедельник, ..., 7=воскресенье
      const weekdayId = validUntilDayOfWeek === 0 ? 7 : validUntilDayOfWeek;
      const weekdayIdStr = weekdayId.toString();

      // Проверяем, выбран ли этот день недели
      if (!weekdays[weekdayIdStr]) {
        return { 
          willTruncate: false, 
          reason: `weekdays: validUntil weekday=${weekdayId} не выбран, выбранные: [${Object.keys(weekdays).join(',')}]` 
        };
      }

      // Проверяем, является ли смена для этого дня ночной
      const times = weekdays[weekdayIdStr];
      if (!isNightShift(times.start, times.end)) {
        return { 
          willTruncate: false, 
          reason: `weekdays: validUntil weekday=${weekdayId} выбран, но смена не ночная (${times.start}-${times.end})` 
        };
      }

      // Обрезка будет, так как на validUntil есть ночная смена, которая продолжится на validUntil+1
      const nightWeekdays = Object.entries(weekdays)
        .filter(([_, t]) => isNightShift(t.start, t.end))
        .map(([id, _]) => id);
      return { 
        willTruncate: true, 
        reason: `weekdays: validUntil weekday=${weekdayId} выбран с ночной сменой, ночные дни: [${nightWeekdays.join(',')}]` 
      };
    }

    // Для monthdays
    if (scheduleType === 'monthdays') {
      if (!effectiveStartDate) {
        return { willTruncate: false, reason: 'effectiveStartDate не установлен' };
      }

      // Получаем день месяца validUntil
      const validUntilDay = validUntil.getDate();
      const dayStr = validUntilDay.toString();

      // Проверяем, выбран ли этот день месяца
      if (!monthdays[dayStr]) {
        return { 
          willTruncate: false, 
          reason: `monthdays: validUntil day=${dayStr} не выбран, выбранные: [${Object.keys(monthdays).join(',')}]` 
        };
      }

      // Проверяем, является ли смена для этого дня ночной
      const times = monthdays[dayStr];
      if (!isNightShift(times.start, times.end)) {
        return { 
          willTruncate: false, 
          reason: `monthdays: validUntil day=${dayStr} выбран, но смена не ночная (${times.start}-${times.end})` 
        };
      }

      // Обрезка будет, так как на validUntil есть ночная смена, которая продолжится на validUntil+1
      return { 
        willTruncate: true, 
        reason: `monthdays: validUntil day=${dayStr} выбран с ночной сменой` 
      };
    }

    // Для shift
    if (scheduleType === 'shift') {
      if (!shiftConfig.startDate) {
        return { willTruncate: false, reason: 'shiftConfig.startDate не установлен' };
      }

      // Проверяем, является ли смена ночной
      if (!isNightShift(shiftConfig.workStartTime, shiftConfig.workEndTime)) {
        return { willTruncate: false, reason: 'shift: смена не ночная' };
      }

      // Для shift обрезка всегда будет при ночной смене, так как последняя дата диапазона всегда validUntil
      return { 
        willTruncate: true, 
        reason: 'shift: ночная смена, последняя дата диапазона = validUntil' 
      };
    }

    return { willTruncate: false, reason: 'неизвестный тип расписания' };
  };

  const getValueDateForKey = (key: PickerKey): Date | null => {
    if (key === 'validUntil') return validUntil;
    if (key === 'shiftStartDate') return shiftConfig.startDate;
    if (key === 'weekdaysStartDate' || key === 'monthdaysStartDate') return effectiveStartDate;
    if (key === 'workStartTime') return parseTimeToDate(shiftConfig.workStartTime);
    if (key === 'workEndTime') return parseTimeToDate(shiftConfig.workEndTime);
    if (key.startsWith('weekday_start_')) {
      const dayId = key.replace('weekday_start_', '');
      return parseTimeToDate(weekdays[dayId]?.start);
    }
    if (key.startsWith('weekday_end_')) {
      const dayId = key.replace('weekday_end_', '');
      return parseTimeToDate(weekdays[dayId]?.end);
    }
    if (key.startsWith('monthday_start_')) {
      const day = key.replace('monthday_start_', '');
      return parseTimeToDate(monthdays[day]?.start);
    }
    if (key.startsWith('monthday_end_')) {
      const day = key.replace('monthday_end_', '');
      return parseTimeToDate(monthdays[day]?.end);
    }
    return null;
  };

  const openDate = (key: PickerKey) => {
    const initial = getValueDateForKey(key);
    setTempPickerDate(initial || new Date());
    pickerSessionRef.current = { key, kind: 'date' };
    setPickerState({ open: true, kind: 'date', key });
  };

  const openTime = (key: PickerKey) => {
    const initial = getValueDateForKey(key);
    const timeString = key.startsWith('weekday_') 
      ? (key.startsWith('weekday_start_') 
          ? weekdays[key.replace('weekday_start_', '')]?.start
          : weekdays[key.replace('weekday_end_', '')]?.end)
      : key.startsWith('monthday_')
      ? (key.startsWith('monthday_start_')
          ? monthdays[key.replace('monthday_start_', '')]?.start
          : monthdays[key.replace('monthday_end_', '')]?.end)
      : key === 'workStartTime' 
      ? shiftConfig.workStartTime
      : key === 'workEndTime'
      ? shiftConfig.workEndTime
      : null;
    const initialDate = initial || parseTimeToDate(timeString || '09:00');
    setTempPickerDate(initialDate);
    pickerSessionRef.current = { key, kind: 'time' };
    setPickerState({ open: true, kind: 'time', key });
  };

  const closePicker = () => {
    pickerSessionRef.current = { key: null, kind: null };
    setPickerState({ open: false, kind: null, key: null });
  };

  const getPickerValue = (): Date => {
    const date = tempPickerDate;
    if (pickerState.kind === 'time') {
      const isValid = !isNaN(date.getTime());
      if (!isValid) {
        return parseTimeToDate('09:00');
      }
    }
    return date;
  };

  const getPickerTitle = (): string => {
    if (!pickerState.key) return '';
    const key = pickerState.key;
    if (key === 'validUntil') return 'Дата окончания';
    if (key === 'shiftStartDate') return 'Дата начала';
    if (key === 'weekdaysStartDate' || key === 'monthdaysStartDate') return 'Дата начала действия';
    if (key === 'workStartTime') return 'Начало рабочего дня';
    if (key === 'workEndTime') return 'Окончание рабочего дня';
    if (key.startsWith('weekday_start_')) {
      const dayId = key.replace('weekday_start_', '');
      const dayName = weekDays.find(d => d.id.toString() === dayId)?.name || '';
      return `Начало работы (${dayName})`;
    }
    if (key.startsWith('weekday_end_')) {
      const dayId = key.replace('weekday_end_', '');
      const dayName = weekDays.find(d => d.id.toString() === dayId)?.name || '';
      return `Окончание работы (${dayName})`;
    }
    if (key.startsWith('monthday_start_')) {
      const day = key.replace('monthday_start_', '');
      return `Начало работы (${day} число)`;
    }
    if (key.startsWith('monthday_end_')) {
      const day = key.replace('monthday_end_', '');
      return `Окончание работы (${day} число)`;
    }
    return pickerState.kind === 'date' ? 'Выбор даты' : 'Выбор времени';
  };

  const stripTime = (date: Date): Date => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  /** Запись выбранной даты в форму (iOS «Готово», общая логика с Android one-step). */
  const commitDateValue = (key: PickerKey, date: Date) => {
    const d = stripTime(date);
    if (key === 'validUntil') {
      clearFieldError('validUntil');
      setValidUntil(d);
      setValidUntilDisplay(formatDateToDisplay(d));
    } else if (key === 'shiftStartDate') {
      clearFieldError('startDate');
      setShiftConfig((prev) => ({ ...prev, startDate: d }));
      setShiftConfigDisplay((prev) => ({ ...prev, startDate: formatDateToDisplay(d) }));
    } else if (key === 'weekdaysStartDate' || key === 'monthdaysStartDate') {
      clearFieldError('effectiveStartDate');
      setEffectiveStartDate(d);
      setEffectiveStartDateDisplay(formatDateToDisplay(d));
    }
  };

  const applyPickerValue = () => {
    if (!pickerState.key || !pickerState.kind) return;

    const key = pickerState.key;
    const date = tempPickerDate;

    if (pickerState.kind === 'date') {
      commitDateValue(key, date);
    } else if (pickerState.kind === 'time') {
      const timeString = formatDateToTime(date);
      if (key === 'workStartTime' || key === 'workEndTime') {
        clearFieldError('workTime');
        if (key === 'workStartTime') {
          setShiftConfig(prev => ({ ...prev, workStartTime: timeString }));
        } else {
          setShiftConfig(prev => ({ ...prev, workEndTime: timeString }));
        }
      } else if (key.startsWith('weekday_start_') || key.startsWith('weekday_end_')) {
        const dayId = key.replace('weekday_start_', '').replace('weekday_end_', '');
        clearFieldError(`weekday_time_${dayId}`);
        if (key.startsWith('weekday_start_')) {
          setWeekdays(prev => ({
            ...prev,
            [dayId]: { ...(prev[dayId] ?? { start: '09:00', end: '18:00' }), start: timeString }
          }));
        } else {
          setWeekdays(prev => ({
            ...prev,
            [dayId]: { ...(prev[dayId] ?? { start: '09:00', end: '18:00' }), end: timeString }
          }));
        }
      } else if (key.startsWith('monthday_start_') || key.startsWith('monthday_end_')) {
        const day = key.replace('monthday_start_', '').replace('monthday_end_', '');
        clearFieldError(`monthday_time_${day}`);
        if (key.startsWith('monthday_start_')) {
          setMonthdays(prev => ({
            ...prev,
            [day]: { ...(prev[day] ?? { start: '09:00', end: '18:00' }), start: timeString }
          }));
        } else {
          setMonthdays(prev => ({
            ...prev,
            [day]: { ...(prev[day] ?? { start: '09:00', end: '18:00' }), end: timeString }
          }));
        }
      }
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        statusBarTranslucent={true}
        presentationStyle="overFullScreen"
      >
        <View style={styles.overlay}>
          {!pickerState.open && (
            <View style={[styles.overlayTouchable, { pointerEvents: 'box-none' }]}>
              <TouchableOpacity 
                style={{ flex: 1 }} 
                activeOpacity={1} 
                onPress={onClose}
              />
            </View>
          )}
          <View 
            style={styles.container}
            pointerEvents="auto"
          >
            <SafeAreaView style={styles.safeArea} edges={['top']}>
              {/* Заголовок */}
              <View style={styles.header}>
                <Text style={styles.title}>Создать расписание</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Контент с скроллом */}
              <ScrollView 
                style={styles.scrollView}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Предупреждение */}
                {!warningHidden && (
                    <View style={styles.warning}>
                      <View style={styles.warningContent}>
                        <Ionicons name="warning-outline" size={22} color="#b45309" style={styles.warningIcon} />
                        <Text style={styles.warningText}>
                          Создание нового расписания удалит существующее расписание в указанном периоде. Слоты с записями клиентов будут сохранены и отмечены как конфликты.
                        </Text>
                        <TouchableOpacity onPress={handleHideWarning} style={styles.warningClose}>
                          <Ionicons name="close" size={20} color="#92400e" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Тип расписания */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Тип расписания:</Text>
                    <TouchableOpacity
                      style={[styles.radioOption, scheduleType === 'weekdays' && styles.radioOptionSelected]}
                      onPress={() => setScheduleType('weekdays')}
                    >
                      <Text style={styles.radioText}>Дни недели</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.radioOption, scheduleType === 'monthdays' && styles.radioOptionSelected]}
                      onPress={() => setScheduleType('monthdays')}
                    >
                      <Text style={styles.radioText}>Числа месяца</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.radioOption, scheduleType === 'shift' && styles.radioOptionSelected]}
                      onPress={() => setScheduleType('shift')}
                    >
                      <Text style={styles.radioText}>Сменный график</Text>
                    </TouchableOpacity>
                    {errors.scheduleType && <Text style={styles.errorText}>{errors.scheduleType}</Text>}
                  </View>

                  {/* Дни недели */}
                  {scheduleType === 'weekdays' && (
                    <View style={styles.section}>
                      {/* Дата начала действия расписания */}
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Дата начала действия расписания:</Text>
                        <Pressable 
                          onPress={() => openDate('weekdaysStartDate')}
                          style={styles.dateInputWrapper}
                          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                        >
                          <TextInput
                            style={[styles.dateInputTextInput, errors.effectiveStartDate && styles.inputError]}
                            value={effectiveStartDateDisplay}
                            editable={false}
                            pointerEvents="none"
                            placeholder="ДД-ММ-ГГГГ"
                            placeholderTextColor="#999"
                          />
                        </Pressable>
                        {errors.effectiveStartDate && <Text style={styles.errorText}>{errors.effectiveStartDate}</Text>}
                      </View>
                      
                      <Text style={styles.sectionTitle}>Выберите рабочие дни:</Text>
                      {weekDays.map((day) => {
                        const isSelected = !!weekdays[day.id.toString()];
                        return (
                          <View key={day.id}>
                            <View style={styles.weekdayRow}>
                              {/* Left zone: checkbox + day name */}
                              <View style={styles.weekdayLeftZone}>
                                <TouchableOpacity
                                  style={[styles.checkbox, isSelected && styles.checkboxSelected]}
                                  onPress={() => {
                                    clearFieldError('weekdays');
                                    if (isSelected) {
                                      const newWeekdays = { ...weekdays };
                                      delete newWeekdays[day.id.toString()];
                                      setWeekdays(newWeekdays);
                                    } else {
                                      const nextWeekdays = {
                                        ...weekdays,
                                        [day.id.toString()]: { start: '09:00', end: '18:00' },
                                      };
                                      setWeekdays(nextWeekdays);
                                    }
                                  }}
                                >
                                  {isSelected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                                </TouchableOpacity>
                                <Text style={styles.weekdayName} numberOfLines={1}>{day.name}</Text>
                              </View>
                              
                              {/* Center zone: badge (reserved space) */}
                              {isSelected && (
                                <View style={styles.weekdayCenterZone}>
                                  {isNightShift(weekdays[day.id.toString()]?.start || '', weekdays[day.id.toString()]?.end || '') && (
                                    <View style={styles.nightShiftBadge}>
                                      <Ionicons name="moon-outline" size={14} color="#5b21b6" style={styles.nightShiftBadgeIcon} />
                                      <Text style={styles.nightShiftBadgeText} numberOfLines={1} ellipsizeMode="tail">Ночная смена</Text>
                                    </View>
                                  )}
                                </View>
                              )}
                              
                              {/* Right zone: time inputs */}
                              {isSelected && (
                                <View style={styles.timeInputs}>
                                  <Pressable 
                                    onPress={() => openTime(`weekday_start_${day.id}` as PickerKey)}
                                    style={styles.timeInputWrapper}
                                  >
                                    <TextInput
                                      style={[
                                        styles.timeInput,
                                        errors[`weekday_time_${day.id}`] && styles.inputError
                                      ]}
                                      value={weekdays[day.id.toString()]?.start || '09:00'}
                                      editable={false}
                                      pointerEvents="none"
                                      placeholder="09:00"
                                      placeholderTextColor="#999"
                                    />
                                  </Pressable>
                                  <Text style={styles.timeSeparator}> - </Text>
                                  <Pressable 
                                    onPress={() => openTime(`weekday_end_${day.id}` as PickerKey)}
                                    style={styles.timeInputWrapper}
                                  >
                                    <TextInput
                                      style={[
                                        styles.timeInput,
                                        errors[`weekday_time_${day.id}`] && styles.inputError
                                      ]}
                                      value={weekdays[day.id.toString()]?.end || '18:00'}
                                      editable={false}
                                      pointerEvents="none"
                                      placeholder="18:00"
                                      placeholderTextColor="#999"
                                    />
                                  </Pressable>
                                </View>
                              )}
                            </View>
                            {isSelected && errors[`weekday_time_${day.id}`] && (
                              <Text style={styles.errorText}>{errors[`weekday_time_${day.id}`]}</Text>
                            )}
                          </View>
                        );
                      })}
                      {errors.weekdays && <Text style={styles.errorText}>{errors.weekdays}</Text>}
                    </View>
                  )}

                  {/* Числа месяца */}
                  {scheduleType === 'monthdays' && (
                    <View style={styles.section}>
                      {/* Дата начала действия расписания */}
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Дата начала действия расписания:</Text>
                        <Pressable 
                          onPress={() => openDate('monthdaysStartDate')}
                          style={styles.dateInputWrapper}
                          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                        >
                          <TextInput
                            style={[styles.dateInputTextInput, errors.effectiveStartDate && styles.inputError]}
                            value={effectiveStartDateDisplay}
                            editable={false}
                            pointerEvents="none"
                            placeholder="ДД-ММ-ГГГГ"
                            placeholderTextColor="#999"
                          />
                        </Pressable>
                        {errors.effectiveStartDate && <Text style={styles.errorText}>{errors.effectiveStartDate}</Text>}
                      </View>
                      
                      <Text style={styles.sectionTitle}>Выберите числа месяца:</Text>
                      <View style={styles.monthdaysGrid}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                          const dayStr = day.toString();
                          const isSelected = !!monthdays[dayStr];
                          return (
                            <TouchableOpacity
                              key={day}
                              style={[styles.monthdayGridItem, isSelected && styles.monthdayGridItemSelected]}
                              onPress={() => {
                                clearFieldError('monthdays');
                                if (isSelected) {
                                  const newMonthdays = { ...monthdays };
                                  delete newMonthdays[dayStr];
                                  setMonthdays(newMonthdays);
                                } else {
                                  const nextMonthdays = {
                                    ...monthdays,
                                    [dayStr]: { start: '09:00', end: '18:00' },
                                  };
                                  setMonthdays(nextMonthdays);
                                }
                              }}
                            >
                              <Text style={[styles.monthdayGridItemText, isSelected && styles.monthdayGridItemTextSelected]}>
                                {day}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {/* Время для выбранных чисел месяца */}
                      {Object.keys(monthdays).length > 0 && (
                        <View style={styles.monthdaysTimeSection}>
                          <Text style={styles.sectionTitle}>Время работы:</Text>
                          {Object.entries(monthdays).map(([day, times]) => {
                            const dayNum = parseInt(day, 10);
                            return (
                              <View key={day} style={styles.monthdayTimeRow}>
                                <Text style={styles.monthdayTimeLabel}>{day} число:</Text>
                                <View style={styles.timeInputs}>
                                  <Pressable 
                                    onPress={() => openTime(`monthday_start_${dayNum}` as PickerKey)}
                                    style={styles.timeInputWrapper}
                                  >
                                    <TextInput
                                      style={[
                                        styles.timeInput,
                                        errors[`monthday_time_${dayNum}`] && styles.inputError
                                      ]}
                                      value={times.start || '09:00'}
                                      editable={false}
                                      pointerEvents="none"
                                      placeholder="09:00"
                                      placeholderTextColor="#999"
                                    />
                                  </Pressable>
                                  <Text style={styles.timeSeparator}> - </Text>
                                  <Pressable 
                                    onPress={() => openTime(`monthday_end_${dayNum}` as PickerKey)}
                                    style={styles.timeInputWrapper}
                                  >
                                    <TextInput
                                      style={[
                                        styles.timeInput,
                                        errors[`monthday_time_${dayNum}`] && styles.inputError
                                      ]}
                                      value={times.end || '18:00'}
                                      editable={false}
                                      pointerEvents="none"
                                      placeholder="18:00"
                                      placeholderTextColor="#999"
                                    />
                                  </Pressable>
                                  {isNightShift(times.start || '', times.end || '') && (
                                    <View style={styles.nightShiftBadge}>
                                      <Ionicons name="moon-outline" size={14} color="#5b21b6" style={styles.nightShiftBadgeIcon} />
                                      <Text style={styles.nightShiftBadgeText} numberOfLines={1} ellipsizeMode="tail">Ночная смена</Text>
                                    </View>
                                  )}
                                </View>
                                {errors[`monthday_time_${dayNum}`] && (
                                  <Text style={styles.errorText}>{errors[`monthday_time_${dayNum}`]}</Text>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}
                      {errors.monthdays && <Text style={styles.errorText}>{errors.monthdays}</Text>}
                    </View>
                  )}

                  {/* Сменный график */}
                  {scheduleType === 'shift' && (
                    <View style={styles.section}>
                      <View style={styles.shiftRow}>
                        <Text style={styles.shiftLabel}>Рабочих дней подряд:</Text>
                        <TextInput
                          style={styles.numberInput}
                          value={shiftConfig.workDays.toString()}
                          onChangeText={(text) => {
                            setShiftConfig({ ...shiftConfig, workDays: parseInt(text) || 0 });
                          }}
                          keyboardType="numeric"
                        />
                      </View>
                      {errors.workDays && <Text style={styles.errorText}>{errors.workDays}</Text>}
                      
                      <View style={styles.shiftRow}>
                        <Text style={styles.shiftLabel}>Нерабочих дней подряд:</Text>
                        <TextInput
                          style={styles.numberInput}
                          value={shiftConfig.restDays.toString()}
                          onChangeText={(text) => {
                            setShiftConfig({ ...shiftConfig, restDays: parseInt(text) || 0 });
                          }}
                          keyboardType="numeric"
                        />
                      </View>
                      {errors.restDays && <Text style={styles.errorText}>{errors.restDays}</Text>}
                      
                      <View style={styles.shiftRow}>
                        <Text style={styles.shiftLabel}>Дата первого рабочего дня:</Text>
                        <Pressable 
                          onPress={() => openDate('shiftStartDate')}
                          style={styles.dateInputWrapper}
                          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                        >
                          <TextInput
                            style={[styles.dateInputTextInput, errors.startDate && styles.inputError, { flex: 0, minWidth: 150 }]}
                            value={shiftConfigDisplay.startDate}
                            editable={false}
                            pointerEvents="none"
                            placeholder="ДД-ММ-ГГГГ"
                            placeholderTextColor="#999"
                          />
                        </Pressable>
                      </View>
                      {errors.startDate && <Text style={styles.errorText}>{errors.startDate}</Text>}
                      
                      <View style={styles.shiftRow}>
                        <Text style={styles.shiftLabel}>Начало рабочего дня:</Text>
                        <Pressable 
                          onPress={() => openTime('workStartTime')}
                          style={styles.timeInputWrapper}
                        >
                          <TextInput
                            style={[
                              styles.timeInput,
                              errors.workTime && styles.inputError,
                              { flex: 0, minWidth: 100 }
                            ]}
                            value={shiftConfig.workStartTime}
                            editable={false}
                            pointerEvents="none"
                            placeholder="09:00"
                            placeholderTextColor="#999"
                          />
                        </Pressable>
                      </View>
                      
                      <View style={styles.shiftRow}>
                        <Text style={styles.shiftLabel}>Окончание рабочего дня:</Text>
                        <Pressable 
                          onPress={() => openTime('workEndTime')}
                          style={styles.timeInputWrapper}
                        >
                          <TextInput
                            style={[
                              styles.timeInput,
                              errors.workTime && styles.inputError,
                              { flex: 0, minWidth: 100 }
                            ]}
                            value={shiftConfig.workEndTime}
                            editable={false}
                            pointerEvents="none"
                            placeholder="18:00"
                            placeholderTextColor="#999"
                          />
                        </Pressable>
                      </View>
                      {isNightShift(shiftConfig.workStartTime, shiftConfig.workEndTime) && (
                        <View style={styles.nightShiftBadge}>
                          <Ionicons name="moon-outline" size={14} color="#5b21b6" style={styles.nightShiftBadgeIcon} />
                          <Text style={styles.nightShiftBadgeText} numberOfLines={1} ellipsizeMode="tail">Ночная смена</Text>
                        </View>
                      )}
                      {errors.workTime && <Text style={styles.errorText}>{errors.workTime}</Text>}
                    </View>
                  )}

                  {/* Дата окончания */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Расписание действует до:</Text>
                    <Pressable 
                      onPress={() => openDate('validUntil')}
                      style={styles.dateInputWrapper}
                      hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                    >
                      <TextInput
                        style={[styles.dateInputTextInput, errors.validUntil && styles.inputError]}
                        value={validUntilDisplay}
                        editable={false}
                        pointerEvents="none"
                        placeholder="ДД-ММ-ГГГГ"
                        placeholderTextColor="#999"
                      />
                    </Pressable>
                    {errors.validUntil && <Text style={styles.errorText}>{errors.validUntil}</Text>}
                  </View>


                </ScrollView>

                {/* Футер с кнопкой (фиксированный внизу) */}
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                  <TouchableOpacity style={styles.createButton} onPress={handleCreate}>
                    <Text style={styles.createButtonText}>Создать расписание</Text>
                  </TouchableOpacity>
                </View>
            </SafeAreaView>
          </View>
          
          {/* Picker-layer внутри основного Modal */}
          {pickerState.open && (
            <View style={styles.pickerLayer} pointerEvents="auto">
              <Pressable style={styles.pickerBackdrop} onPress={closePicker} />
              <View style={styles.pickerSheet}>
                <View style={styles.pickerHeader}>
                  <Pressable onPress={closePicker}>
                    <Text style={styles.pickerCancelText}>Отмена</Text>
                  </Pressable>
                  <Text style={styles.pickerTitle}>
                    {getPickerTitle()}
                  </Text>
                  <Pressable onPress={() => { applyPickerValue(); closePicker(); }}>
                    <Text style={styles.pickerDoneText}>Готово</Text>
                  </Pressable>
                </View>
                {pickerState.kind === 'date' ? (
                  <DateTimePicker
                    value={getPickerValue()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={(event, date) => {
                      // Системный диалог Android: dismissed — закрываем кастомный overlay, иначе «залипание».
                      if (event?.type === 'dismissed') {
                        closePicker();
                        return;
                      }
                      // Android default: подтверждение в нативном диалоге — сразу коммитим и убираем второй слой (sheet).
                      if (Platform.OS === 'android') {
                        if (
                          date &&
                          pickerSessionRef.current.kind === 'date' &&
                          pickerSessionRef.current.key
                        ) {
                          setTempPickerDate(date);
                          commitDateValue(pickerSessionRef.current.key, date);
                          closePicker();
                        }
                        return;
                      }
                      if (date) {
                        setTempPickerDate(date);
                      }
                    }}
                    locale="ru_RU"
                    minimumDate={new Date()}
                  />
                ) : (
                  // Выбор времени из списка 30-минутных интервалов
                  <ScrollView style={styles.timePickerList}>
                    {TIME_INTERVALS.map((timeStr) => {
                      const [hh, mm] = timeStr.split(':').map(Number);
                      const currentTime = formatDateToTime(getPickerValue());
                      const isSelected = currentTime === timeStr;
                      return (
                        <Pressable
                          key={timeStr}
                          style={[styles.timeOption, isSelected && styles.timeOptionSelected]}
                          onPress={() => {
                            const d = new Date();
                            d.setHours(hh, mm, 0, 0);
                            setTempPickerDate(d);
                          }}
                        >
                          <Text style={[styles.timeOptionText, isSelected && styles.timeOptionTextSelected]}>
                            {timeStr}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>
  </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    height: SCREEN_HEIGHT * 0.85,
    maxHeight: '90%',
  },
  safeArea: {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexShrink: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  contentContainer: {
    paddingBottom: 20,
    flexGrow: 1,
  },
  warning: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  warningContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  warningText: {
    fontSize: 13,
    color: '#856404',
    lineHeight: 18,
    flex: 1,
    marginRight: 8,
  },
  warningClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(133, 100, 4, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -2,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  radioOption: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 8,
  },
  radioOptionSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  radioText: {
    fontSize: 16,
    color: '#333',
  },
  weekdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'nowrap',
  },
  weekdayLeftZone: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 60,
    maxWidth: 100,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    flexShrink: 0,
  },
  checkboxSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  weekdayName: {
    fontSize: 16,
    color: '#333',
    flexShrink: 0,
  },
  weekdayCenterZone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
    maxWidth: 140,
    marginHorizontal: 8,
    flexShrink: 1,
  },
  monthdaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginHorizontal: -4,
  },
  monthdayGridItem: {
    width: '13.5%',
    aspectRatio: 1,
    minWidth: 38,
    maxWidth: 45,
    margin: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthdayGridItemSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  monthdayGridItemText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  monthdayGridItemTextSelected: {
    color: '#fff',
  },
  monthdaysTimeSection: {
    marginTop: 16,
  },
  monthdayTimeRow: {
    marginBottom: 12,
  },
  monthdayTimeLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  timeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    flexShrink: 0,
    flexWrap: 'nowrap',
  },
  timeInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 6,
    width: 60,
    fontSize: 13,
    textAlign: 'center',
    color: '#333',
    minHeight: 32,
  },
  timeSeparator: {
    fontSize: 13,
    color: '#666',
    marginHorizontal: 4,
  },
  nightShiftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 130,
    flexShrink: 1,
  },
  nightShiftBadgeIcon: {
    marginRight: 4,
  },
  nightShiftBadgeText: {
    fontSize: 10,
    color: '#4CAF50',
    fontWeight: '500',
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  shiftLabel: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 8,
    width: 80,
    textAlign: 'center',
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    flex: 1,
  },
  dateInputTouchable: {
    justifyContent: 'center',
    minHeight: 48,
  },
  dateInputTextInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    color: '#333',
    minHeight: 48,
  },
  dateInputText: {
    fontSize: 16,
    color: '#333',
  },
  dateInputPlaceholder: {
    color: '#999',
  },
  inputError: {
    borderColor: '#F44336',
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerOverlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  datePickerModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '50%',
    width: '100%',
    alignSelf: 'flex-end',
  },
  datePickerModalContent: {
    width: '100%',
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  datePickerCancel: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  datePickerCancelText: {
    color: '#666',
    fontSize: 16,
  },
  datePickerDone: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  datePickerDoneText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginTop: 4,
  },
  androidPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  androidPickerOverlayTouchable: {
    ...StyleSheet.absoluteFillObject,
  },
  androidPickerWrapper: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '90%',
    maxWidth: 400,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  androidPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  androidPickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  androidPickerClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  androidPickerCloseText: {
    fontSize: 18,
    color: '#666',
    fontWeight: '600',
  },
  androidPickerFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  androidPickerButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  androidPickerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  createButton: {
    width: '100%',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pickerLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
  },
  pickerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  pickerSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 12,
    maxHeight: '80%',
  },
  timePickerList: {
    maxHeight: 400,
    paddingVertical: 8,
  },
  timeOption: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  timeOptionSelected: {
    backgroundColor: '#e3f2fd',
  },
  timeOptionText: {
    fontSize: 16,
    color: '#333',
  },
  timeOptionTextSelected: {
    color: '#1976d2',
    fontWeight: '600',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  pickerTitle: {
    fontWeight: '600',
    fontSize: 16,
    color: '#333',
  },
  pickerCancelText: {
    color: '#666',
    fontSize: 16,
  },
  pickerDoneText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dateInputWrapper: {
    alignSelf: 'flex-start',
    width: '100%',
  },
  timeInputWrapper: {
    borderRadius: 4,
  },
});

