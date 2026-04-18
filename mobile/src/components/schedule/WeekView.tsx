import React, { useState, useMemo, useRef, useEffect, type ReactElement } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT } from '@src/constants/bottomNavLayout';
import { ScheduleWeek, Booking, ScheduleSlot, MasterSettings } from '@src/services/api/master';
import { DayDrawer } from './DayDrawer';
import { apiClient } from '@src/services/api/client';

interface WeekViewProps {
  schedule: ScheduleWeek;
  bookings: Booking[];
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  onScheduleUpdated?: () => void;
  masterSettings?: MasterSettings | null;
  refreshControl?: ReactElement;
  hasExtendedStats?: boolean;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_COLUMN_WIDTH = (SCREEN_WIDTH - 60) / 7; // 60px для колонки времени
const TIME_SLOT_HEIGHT = 40; // Высота слота 30 минут
const START_HOUR = 0; // Начинаем с 0:00 (все 24 часа доступны)
const END_HOUR = 23; // Заканчиваем в 23:00
const INITIAL_SCROLL_HOUR = 7; // Начальная позиция скролла - 7:00

export function WeekView({
  schedule,
  bookings,
  weekOffset,
  onWeekChange,
  onScheduleUpdated,
  masterSettings,
  refreshControl,
  hasExtendedStats = false,
}: WeekViewProps) {
  const insets = useSafeAreaInsets();
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editAction, setEditAction] = useState<'open' | 'close' | 'clear' | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [dragStart, setDragStart] = useState<{ date: string; hour: number; minute: number } | null>(null);
  const [localSchedule, setLocalSchedule] = useState<ScheduleWeek>(schedule);
  const [undoStack, setUndoStack] = useState<ScheduleWeek[]>([]);
  const timeScrollRef = useRef<ScrollView>(null);
  const daysScrollRef = useRef<ScrollView>(null);
  /** Блокирует ping-pong: scrollTo на втором ScrollView вызывает onScroll → снова scrollTo на первом → дёрганье. */
  const verticalScrollSyncLockRef = useRef(false);
  
  const bottomNavHeight = BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT;

  // Вычисляем даты недели
  const weekDates = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1) + weekOffset * 7);
    
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      dates.push(date);
    }
    return dates;
  }, [weekOffset]);

  // Группируем слоты по дням
  const slotsByDay = useMemo(() => {
    const grouped: { [date: string]: ScheduleSlot[] } = {};
    weekDates.forEach((date) => {
      const dateStr = date.toISOString().split('T')[0];
      grouped[dateStr] = localSchedule.slots.filter(
        (slot) => (slot.date || slot.schedule_date) === dateStr
      );
    });
    return grouped;
  }, [localSchedule.slots, weekDates]);

  // Группируем bookings по дням
  const bookingsByDay = useMemo(() => {
    const grouped: { [date: string]: Booking[] } = {};
    weekDates.forEach((date) => {
      const dateStr = date.toISOString().split('T')[0];
      grouped[dateStr] = bookings.filter((booking) => {
        const bookingDate = new Date(booking.start_time).toISOString().split('T')[0];
        return bookingDate === dateStr;
      });
    });
    return grouped;
  }, [bookings, weekDates]);

  // Генерируем временные слоты для всех 24 часов
  const timeSlots = useMemo(() => {
    const slots: Array<{ hour: number; minute: number; label: string }> = [];
    for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
      for (let minute of [0, 30]) {
        if (hour === END_HOUR && minute === 30) break;
        const hourStr = hour.toString().padStart(2, '0');
        const minuteStr = minute.toString().padStart(2, '0');
        slots.push({
          hour,
          minute,
          label: `${hourStr}:${minuteStr}`,
        });
      }
    }
    return slots;
  }, []);

  // Вычисляем начальную позицию скролла (7:00)
  const initialScrollY = useMemo(() => {
    // Находим индекс слота для 7:00
    const initialIndex = timeSlots.findIndex(slot => slot.hour === INITIAL_SCROLL_HOUR && slot.minute === 0);
    return initialIndex >= 0 ? initialIndex * TIME_SLOT_HEIGHT : 0;
  }, [timeSlots]);

  // Форматируем дату для заголовка
  const formatWeekTitle = () => {
    const start = weekDates[0];
    const end = weekDates[6];
    const startStr = start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const endStr = end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${startStr} - ${endStr}`;
  };

  // Проверяем, доступен ли слот
  const isSlotAvailable = (date: string, hour: number, minute: number): boolean => {
    const daySlots = slotsByDay[date] || [];
    const slot = daySlots.find(
      (s) => s.hour === hour && s.minute === minute
    );
    return slot ? (slot.is_available ?? slot.is_working) : false;
  };

  // Получаем bookings для слота
  const getBookingsForSlot = (date: string, hour: number, minute: number): Booking[] => {
    const dayBookings = bookingsByDay[date] || [];
    // Примечание: здесь date уже в формате YYYY-MM-DD, создаём datetime строку для парсинга
    // Это безопасно, так как создаём ISO-подобную строку с временем, не просто YYYY-MM-DD
    const slotStart = new Date(`${date}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
    
    return dayBookings.filter((booking) => {
      // Примечание: booking.start_time/end_time приходят из API как ISO datetime строки
      // (не YYYY-MM-DD), поэтому new Date() здесь безопасен
      const bookingStart = new Date(booking.start_time);
      const bookingEnd = new Date(booking.end_time);
      // Проверяем пересечение интервалов
      return bookingStart < slotEnd && bookingEnd > slotStart;
    });
  };

  // Получаем все bookings для дня (для отображения в Day Drawer)
  const getDayBookings = (date: string): Booking[] => {
    return bookingsByDay[date] || [];
  };

  const handleDayPress = (date: string) => {
    if (!isEditMode) {
      setSelectedDate(date);
    }
  };

  const handleCloseDayDrawer = () => {
    setSelectedDate(null);
  };

  // Сохраняем состояние для UNDO
  const saveStateForUndo = () => {
    setUndoStack([...undoStack, JSON.parse(JSON.stringify(localSchedule))]);
    // Ограничиваем размер стека до 1 (только последнее действие)
    if (undoStack.length >= 1) {
      setUndoStack([undoStack[undoStack.length - 1]]);
    }
  };

  // UNDO последнего действия
  const handleUndo = () => {
    if (undoStack.length > 0) {
      const previousState = undoStack[undoStack.length - 1];
      setLocalSchedule(previousState);
      setUndoStack([]);
    }
  };

  // Обновляем локальное расписание при изменении пропсов
  useEffect(() => {
    setLocalSchedule(schedule);
  }, [schedule]);

  // Стартовый скролл к ~7:00 (один раз при смене недели / offset; lock убирает ping-pong с onScroll).
  useEffect(() => {
    if (initialScrollY <= 0) return;
    const t = setTimeout(() => {
      if (!timeScrollRef.current || !daysScrollRef.current) return;
      verticalScrollSyncLockRef.current = true;
      timeScrollRef.current.scrollTo({ y: initialScrollY, animated: false });
      daysScrollRef.current.scrollTo({ y: initialScrollY, animated: false });
      requestAnimationFrame(() => {
        verticalScrollSyncLockRef.current = false;
      });
    }, 80);
    return () => clearTimeout(t);
  }, [initialScrollY, weekOffset]);

  const handleTimeColumnScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (verticalScrollSyncLockRef.current) return;
    const y = e.nativeEvent.contentOffset.y;
    verticalScrollSyncLockRef.current = true;
    daysScrollRef.current?.scrollTo({ y, animated: false });
    requestAnimationFrame(() => {
      verticalScrollSyncLockRef.current = false;
    });
  };

  const handleDaysColumnScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (verticalScrollSyncLockRef.current) return;
    const y = e.nativeEvent.contentOffset.y;
    verticalScrollSyncLockRef.current = true;
    timeScrollRef.current?.scrollTo({ y, animated: false });
    requestAnimationFrame(() => {
      verticalScrollSyncLockRef.current = false;
    });
  };

  // Обработка long press для начала выделения
  const handleSlotLongPress = (date: string, hour: number, minute: number) => {
    if (!isEditMode) return;
    
    const slotKey = `${date}_${hour}_${minute}`;
    const currentValue = isSlotAvailable(date, hour, minute);
    
    // Определяем действие на основе текущего состояния
    const action = currentValue ? 'close' : 'open';
    setEditAction(action);
    setDragStart({ date, hour, minute });
    setSelectedSlots(new Set([slotKey]));
    
    // Сохраняем состояние для UNDO
    saveStateForUndo();
  };

  // Обработка движения при drag
  const handleSlotMove = (date: string, hour: number, minute: number) => {
    if (!isEditMode || !dragStart || !editAction) return;
    
    const slotKey = `${date}_${hour}_${minute}`;
    const newSelected = new Set(selectedSlots);
    
    // Вычисляем диапазон слотов между началом и текущей позицией
    const startDate = new Date(dragStart.date);
    const endDate = new Date(date);
    const startHour = dragStart.hour;
    const startMinute = dragStart.minute;
    const endHour = hour;
    const endMinute = minute;
    
    // Добавляем все слоты в диапазоне
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const currentHour = currentDate.getTime() === startDate.getTime() ? startHour : 
                         currentDate.getTime() === endDate.getTime() ? endHour : 
                         START_HOUR;
      const currentMinute = currentDate.getTime() === startDate.getTime() ? startMinute : 
                           currentDate.getTime() === endDate.getTime() ? endMinute : 
                           0;
      const endHourForDay = currentDate.getTime() === endDate.getTime() ? endHour : 23;
      const endMinuteForDay = currentDate.getTime() === endDate.getTime() ? endMinute : 0;
      
      for (let h = currentHour; h <= endHourForDay; h++) {
        for (let m of [0, 30]) {
          if (h === currentHour && m < currentMinute) continue;
          if (h === endHourForDay && m > endMinuteForDay) break;
          if (h === 23 && m === 30) break;
          
          const key = `${dateStr}_${h}_${m}`;
          newSelected.add(key);
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    setSelectedSlots(newSelected);
  };

  // Обработка окончания drag
  const handleSlotRelease = () => {
    if (!isEditMode || !editAction || selectedSlots.size === 0) return;
    
    // Применяем действие к выбранным слотам
    applyActionToSelectedSlots(editAction);
  };

  // Применение действия к выбранным слотам с автоматическим сохранением
  const applyActionToSelectedSlots = async (action: 'open' | 'close') => {
    if (selectedSlots.size === 0) return;
    
    const slotsToUpdate = Array.from(selectedSlots);
    const updatedSlots = localSchedule.slots.map((slot) => {
      const slotKey = `${slot.date || slot.schedule_date}_${slot.hour}_${slot.minute}`;
      if (selectedSlots.has(slotKey)) {
        return {
          ...slot,
          is_available: action === 'open',
          is_working: action === 'open',
        };
      }
      return slot;
    });
    
    setLocalSchedule({ ...localSchedule, slots: updatedSlots });
    setSelectedSlots(new Set());
    setDragStart(null);
    setEditAction(null);
    
    // Автоматически сохраняем изменения
    try {
      const slotsToSave = updatedSlots
        .filter(slot => {
          const slotKey = `${slot.date || slot.schedule_date}_${slot.hour}_${slot.minute}`;
          return slotsToUpdate.includes(slotKey) && action === 'open';
        })
        .map(slot => {
          const date = slot.date || slot.schedule_date;
          let dateStr = date;
          if (date instanceof Date) {
            dateStr = date.toISOString().split('T')[0];
          } else if (typeof date === 'string') {
            const dateMatch = date.match(/^\d{4}-\d{2}-\d{2}/);
            if (!dateMatch) {
              const dateObj = new Date(date);
              if (!isNaN(dateObj.getTime())) {
                dateStr = dateObj.toISOString().split('T')[0];
              }
            }
          }
          
          return {
            schedule_date: dateStr,
            hour: slot.hour,
            minute: slot.minute,
            is_working: action === 'open',
            has_conflict: slot.has_conflict || false,
            is_frozen: slot.is_frozen || false,
          };
        });

      if (slotsToSave.length > 0) {
        await apiClient.put('/api/master/schedule/weekly', { slots: slotsToSave });
        if (onScheduleUpdated) {
          onScheduleUpdated();
        }
      }
    } catch (error: any) {
      console.error('Ошибка автоматического сохранения:', error);
      Alert.alert('Ошибка', 'Не удалось сохранить изменения');
    }
  };

  // Обработка тапа по слоту в режиме редактирования
  const handleSlotPress = (date: string, hour: number, minute: number) => {
    if (!isEditMode) {
      handleDayPress(date);
      return;
    }
    
    // Простое переключение одного слота
    saveStateForUndo();
    
    const updatedSlots = localSchedule.slots.map((slot) => {
      if ((slot.date || slot.schedule_date) === date && 
          slot.hour === hour && 
          slot.minute === minute) {
        const newValue = !(slot.is_available ?? slot.is_working);
        return {
          ...slot,
          is_available: newValue,
          is_working: newValue,
        };
      }
      return slot;
    });
    
    setLocalSchedule({ ...localSchedule, slots: updatedSlots });
  };

  // Сохранение изменений
  const handleSave = async () => {
    try {
      // Отправляем только слоты, где is_working = true (доступные слоты)
      // Бэкенд сам удалит все слоты для недели и создаст новые
      const slots = localSchedule.slots
        .filter(slot => {
          const isAvailable = slot.is_available !== undefined ? slot.is_available : slot.is_working;
          // Отправляем только доступные слоты (is_working = true)
          return isAvailable === true;
        })
        .map(slot => {
          const date = slot.date || slot.schedule_date;
          const hour = slot.hour !== undefined ? slot.hour : parseInt((slot.start_time || '0:0').split(':')[0]);
          const minute = slot.minute !== undefined ? slot.minute : parseInt((slot.start_time || '0:0').split(':')[1]);
          
          // Убеждаемся, что дата в формате YYYY-MM-DD
          let dateStr = date;
          if (date instanceof Date) {
            dateStr = date.toISOString().split('T')[0];
          } else if (typeof date === 'string') {
            // Проверяем формат даты
            const dateMatch = date.match(/^\d{4}-\d{2}-\d{2}/);
            if (!dateMatch) {
              // Пытаемся преобразовать
              const dateObj = new Date(date);
              if (!isNaN(dateObj.getTime())) {
                dateStr = dateObj.toISOString().split('T')[0];
              }
            }
          }
          
          // Валидация данных перед отправкой
          if (isNaN(hour) || hour < 0 || hour > 23) {
            console.error('Некорректный час:', hour, 'для слота:', slot);
            return null;
          }
          if (isNaN(minute) || minute < 0 || minute > 59) {
            console.error('Некорректная минута:', minute, 'для слота:', slot);
            return null;
          }
          if (!dateStr || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            console.error('Некорректная дата:', dateStr, 'для слота:', slot);
            return null;
          }
          
          return {
            schedule_date: dateStr,
            hour: hour,
            minute: minute,
            is_working: true,
            has_conflict: slot.has_conflict || false,
            is_frozen: slot.is_frozen || false,
          };
        })
        .filter(slot => slot !== null); // Убираем null значения

      console.log('Отправка слотов на сервер:', slots.length, 'слотов');
      if (slots.length > 0) {
        console.log('Пример слота:', slots[0]);
      }
      
      // Проверяем, что есть слоты для отправки
      if (slots.length === 0) {
        const { Alert } = await import('react-native');
        Alert.alert('Предупреждение', 'Нет доступных слотов для сохранения');
        return;
      }
      
      await apiClient.put('/api/master/schedule/weekly', { slots });
      
      setIsEditMode(false);
      setUndoStack([]);
      
      // Показываем успешное сообщение
      Alert.alert('Успех', 'Расписание сохранено');
      
      // Перезагружаем расписание
      if (onScheduleUpdated) {
        onScheduleUpdated();
      }
    } catch (error: any) {
      console.error('Ошибка сохранения расписания:', error);
      const errorMessage = error.response?.data?.detail || error.response?.data?.message || error.message || 'Не удалось сохранить расписание';
      Alert.alert('Ошибка', errorMessage);
    }
  };

  // Отмена редактирования
  const handleCancelEdit = () => {
    setLocalSchedule(schedule);
    setIsEditMode(false);
    setSelectedSlots(new Set());
    setDragStart(null);
    setEditAction(null);
    setUndoStack([]);
  };

  return (
    <View style={styles.container}>
      {/* Верхняя панель с навигацией */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onWeekChange(weekOffset - 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={28} color="#333" />
        </TouchableOpacity>
        <Text style={styles.weekTitle}>{formatWeekTitle()}</Text>
        <TouchableOpacity onPress={() => onWeekChange(weekOffset + 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-forward" size={28} color="#333" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onWeekChange(0)}>
          <Text style={styles.todayButton}>Сегодня</Text>
        </TouchableOpacity>
      </View>

      {/* Сетка расписания */}
      <View style={styles.gridContainer}>
        {/* Колонка времени (sticky) */}
        <View style={styles.timeColumn}>
          <View style={styles.timeHeader} />
          <ScrollView
            ref={timeScrollRef}
            showsVerticalScrollIndicator={false}
            style={styles.timeScroll}
            onScroll={handleTimeColumnScroll}
            scrollEventThrottle={32}
          >
            {timeSlots.map((slot, index) => (
              <View key={index} style={styles.timeSlot}>
                {slot.minute === 0 && (
                  <Text style={styles.timeLabel}>{slot.label}</Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Колонки дней */}
        <View style={styles.daysContainer}>
          {/* Заголовки дней (sticky) */}
          <View style={styles.daysHeaderSticky}>
            {weekDates.map((date, index) => {
              const dateStr = date.toISOString().split('T')[0];
              const dayName = date.toLocaleDateString('ru-RU', { weekday: 'short' });
              const dayNumber = date.getDate();
              const isToday = dateStr === new Date().toISOString().split('T')[0];
              
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.dayHeader, isToday && styles.dayHeaderToday]}
                  onPress={() => handleDayPress(dateStr)}
                >
                  <Text style={[styles.dayName, isToday && styles.dayNameToday]}>
                    {dayName}
                  </Text>
                  <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
                    {dayNumber}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.daysHorizontalScroll}
            nestedScrollEnabled
            directionalLockEnabled={Platform.OS === 'ios'}
          >
            <ScrollView
              ref={daysScrollRef}
              nestedScrollEnabled
              directionalLockEnabled={Platform.OS === 'ios'}
              showsVerticalScrollIndicator={false}
              style={styles.daysScroll}
              contentContainerStyle={styles.daysScrollContent}
              onScroll={handleDaysColumnScroll}
              scrollEventThrottle={32}
              refreshControl={refreshControl}
            >
              {/* Сетка слотов */}
              <View style={styles.grid}>
            {weekDates.map((date, dayIndex) => {
              const dateStr = date.toISOString().split('T')[0];
              return (
                <View key={dayIndex} style={styles.dayColumn}>
                  {timeSlots.map((timeSlot, timeIndex) => {
                    const isAvailable = isSlotAvailable(dateStr, timeSlot.hour, timeSlot.minute);
                    const slotBookings = getBookingsForSlot(dateStr, timeSlot.hour, timeSlot.minute);
                    const hasBooking = slotBookings.length > 0;
                    const booking = slotBookings[0]; // Берем первую запись для отображения
                    
                    return (
                      <TouchableOpacity
                        key={timeIndex}
                        style={[
                          styles.slot,
                          isAvailable && styles.slotAvailable,
                          hasBooking && styles.slotBooked,
                          selectedSlots.has(`${dateStr}_${timeSlot.hour}_${timeSlot.minute}`) && styles.slotSelected,
                        ]}
                        onPress={() => handleSlotPress(dateStr, timeSlot.hour, timeSlot.minute)}
                        onLongPress={() => handleSlotLongPress(dateStr, timeSlot.hour, timeSlot.minute)}
                        onPressIn={() => {
                          if (isEditMode && dragStart) {
                            handleSlotMove(dateStr, timeSlot.hour, timeSlot.minute);
                          }
                        }}
                        onPressOut={handleSlotRelease}
                      >
                        {hasBooking && (
                          <View style={styles.bookingBlock}>
                            <Text style={styles.bookingTime} numberOfLines={1}>
                              {new Date(booking.start_time).toLocaleTimeString('ru-RU', { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </Text>
                            <Text style={styles.bookingService} numberOfLines={1}>
                              {booking.service_name}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
              </View>
            </ScrollView>
          </ScrollView>
        </View>
      </View>

      {/* Кнопка редактирования / Панель инструментов */}
      {!isEditMode ? (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setIsEditMode(true)}
          >
            <Text style={styles.editButtonText}>Изменить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.editToolbar}>
          <View style={styles.toolbarRow}>
            <TouchableOpacity
              style={[styles.toolbarButton, styles.toolbarButtonPrimary]}
              onPress={async () => {
                if (selectedSlots.size === 0) {
                  Alert.alert('Предупреждение', 'Выберите слоты для открытия');
                  return;
                }
                saveStateForUndo();
                await applyActionToSelectedSlots('open');
              }}
            >
              <Text style={styles.toolbarButtonText}>Открыть</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolbarButton, styles.toolbarButtonDanger]}
              onPress={async () => {
                if (selectedSlots.size === 0) {
                  Alert.alert('Предупреждение', 'Выберите слоты для закрытия');
                  return;
                }
                saveStateForUndo();
                await applyActionToSelectedSlots('close');
              }}
            >
              <Text style={styles.toolbarButtonText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.toolbarRow}>
            <TouchableOpacity
              style={[styles.toolbarButton, styles.toolbarButtonSecondary]}
              onPress={() => {
                setSelectedSlots(new Set());
                setEditAction(null);
              }}
            >
              <Text style={styles.toolbarButtonText}>Снять выделение</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolbarButton, styles.toolbarButtonCancel]}
              onPress={handleCancelEdit}
            >
              <Text style={styles.toolbarButtonText}>Отменить</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Day Drawer */}
      {selectedDate && (
        <DayDrawer
          visible={!!selectedDate}
          date={selectedDate}
          bookings={getDayBookings(selectedDate)}
          slots={slotsByDay[selectedDate] || []}
          onClose={handleCloseDayDrawer}
          onCancelSuccess={onScheduleUpdated}
          masterSettings={masterSettings}
          hasExtendedStats={hasExtendedStats}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  weekTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  todayButton: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  gridContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  timeColumn: {
    width: 60,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  timeScroll: {
    flex: 1,
  },
  daysContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  daysHeaderSticky: {
    flexDirection: 'row',
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
    zIndex: 10,
    position: 'relative',
  },
  daysHorizontalScroll: {
    flex: 1,
  },
  daysScroll: {
    flex: 1,
  },
  daysScrollContent: {
    paddingBottom: 0,
  },
  timeHeader: {
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
    zIndex: 10,
  },
  timeSlot: {
    height: TIME_SLOT_HEIGHT,
    justifyContent: 'flex-start',
    paddingLeft: 8,
    paddingTop: 4,
  },
  timeLabel: {
    fontSize: 12,
    color: '#666',
  },
  dayHeader: {
    width: DAY_COLUMN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  dayHeaderToday: {
    backgroundColor: '#E3F2FD',
  },
  dayName: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
  dayNameToday: {
    color: '#1976D2',
    fontWeight: '600',
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
  },
  dayNumberToday: {
    color: '#1976D2',
  },
  grid: {
    flexDirection: 'row',
  },
  dayColumn: {
    width: DAY_COLUMN_WIDTH,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  slot: {
    height: TIME_SLOT_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    backgroundColor: '#fff',
  },
  slotAvailable: {
    backgroundColor: '#E8F5E9',
  },
  slotBooked: {
    backgroundColor: '#FFF3E0',
    position: 'relative',
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  bookingBlock: {
    flex: 1,
    padding: 2,
    justifyContent: 'center',
  },
  bookingTime: {
    fontSize: 9,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 1,
  },
  bookingService: {
    fontSize: 8,
    color: '#E65100',
  },
  footer: {
    padding: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  editButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  slotSelected: {
    backgroundColor: '#DFF5EC',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  editToolbar: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  toolbarRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 3,
  },
  toolbarButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
  },
  toolbarButtonPrimary: {
    backgroundColor: '#4CAF50',
  },
  toolbarButtonDanger: {
    backgroundColor: '#F44336',
  },
  toolbarButtonSecondary: {
    backgroundColor: '#FF9800',
  },
  toolbarButtonSuccess: {
    backgroundColor: '#2196F3',
  },
  toolbarButtonCancel: {
    backgroundColor: '#9E9E9E',
  },
  toolbarButtonText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 12,
  },
  toolbarButtonTextDisabled: {
    opacity: 0.5,
  },
});

