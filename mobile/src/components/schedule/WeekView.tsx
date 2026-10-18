import { formatLocalDate } from '@src/utils/date';
import React, { useState, useMemo, useRef, useEffect, useCallback, memo, type ReactElement } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScheduleWeek, Booking, ScheduleSlot, MasterSettings } from '@src/services/api/master';
import { DayDrawer } from './DayDrawer';
import { apiClient } from '@src/services/api/client';
import { isIosFreeCompanion } from '@src/config/iosProductModel';

interface WeekViewProps {
  schedule: ScheduleWeek;
  bookings: Booking[];
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  onScheduleUpdated?: () => void | Promise<void>;
  masterSettings?: MasterSettings | null;
  refreshControl?: React.ComponentProps<typeof FlatList>['refreshControl'];
  hasExtendedStats?: boolean;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_COLUMN_WIDTH = (SCREEN_WIDTH - 60) / 7; // 60px для колонки времени
const TIME_SLOT_HEIGHT = 40; // Высота слота 30 минут
const PIXELS_PER_MINUTE = TIME_SLOT_HEIGHT / 30;
const START_HOUR = 0; // Начинаем с 0:00 (все 24 часа доступны)
const END_HOUR = 23; // Заканчиваем в 23:00
const INITIAL_SCROLL_HOUR = 9; // Начальная позиция скролла — 09:00

type WeekSlotCellProps = {
  isAvailable: boolean;
  isSelected: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  testID: string;
};

const WeekSlotCell = memo(function WeekSlotCell({
  isAvailable,
  isSelected,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  testID,
}: WeekSlotCellProps) {
  return (
    <Pressable
      testID={testID}
      style={[
        styles.slot,
        isAvailable && styles.slotAvailable,
        isSelected && styles.slotSelected,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    />
  );
});

function slotKeyFromParts(dateStr: string, hour: number, minute: number): string {
  return `${dateStr}_${hour}_${minute}`;
}

type TimeSlotRow = { hour: number; minute: number; label: string };

type SlotGridMeta = {
  availability: Map<string, boolean>;
};

type SlotHandlers = {
  onPress: Map<string, () => void>;
  onLongPress: Map<string, () => void>;
  onPressIn: Map<string, () => void>;
};

/** Payload открытых слотов для PUT /api/master/schedule/weekly */
function buildWeeklyOpenSlotsPayload(slots: ScheduleSlot[]) {
  return slots
    .filter((slot) => !!(slot.is_available ?? slot.is_working))
    .map((slot) => {
      const date: unknown = slot.date || slot.schedule_date;
      const hour =
        slot.hour !== undefined ? slot.hour : parseInt((slot.start_time || '0:0').split(':')[0], 10);
      const minute =
        slot.minute !== undefined ? slot.minute : parseInt((slot.start_time || '0:0').split(':')[1], 10);

      let dateStr = date as string;
      if (date instanceof Date) {
        dateStr = formatLocalDate(date);
      } else if (typeof date === 'string') {
        const dateMatch = date.match(/^\d{4}-\d{2}-\d{2}/);
        if (!dateMatch) {
          const dateObj = new Date(date);
          if (!isNaN(dateObj.getTime())) {
            dateStr = formatLocalDate(dateObj);
          }
        }
      }

      if (isNaN(hour) || hour < 0 || hour > 23) return null;
      if (isNaN(minute) || minute < 0 || minute > 59) return null;
      if (!dateStr || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return null;

      return {
        schedule_date: dateStr,
        hour,
        minute,
        is_working: true,
        has_conflict: slot.has_conflict || false,
        is_frozen: isIosFreeCompanion(Platform.OS) ? false : Boolean(slot.is_frozen),
      };
    })
    .filter((slot): slot is NonNullable<typeof slot> => slot !== null);
}

type WeekGridRowProps = {
  timeSlot: TimeSlotRow;
  weekDateStrings: readonly string[];
  slotGridMeta: SlotGridMeta;
  selectedSlots: Set<string>;
  isEditMode: boolean;
  dragStart: { date: string; hour: number; minute: number } | null;
  slotInteractionHandlers: SlotHandlers;
  onSlotRelease: () => void;
};

function weekGridRowPropsEqual(prev: WeekGridRowProps, next: WeekGridRowProps): boolean {
  if (prev.timeSlot !== next.timeSlot) return false;
  if (prev.weekDateStrings !== next.weekDateStrings) return false;
  if (prev.slotGridMeta !== next.slotGridMeta) return false;
  if (prev.isEditMode !== next.isEditMode) return false;
  if (prev.dragStart !== next.dragStart) return false;
  if (prev.slotInteractionHandlers !== next.slotInteractionHandlers) return false;
  if (prev.onSlotRelease !== next.onSlotRelease) return false;
  for (const dateStr of prev.weekDateStrings) {
    const key = slotKeyFromParts(dateStr, prev.timeSlot.hour, prev.timeSlot.minute);
    if (prev.selectedSlots.has(key) !== next.selectedSlots.has(key)) return false;
  }
  return true;
}

const WeekGridRow = memo(function WeekGridRow({
  timeSlot,
  weekDateStrings,
  slotGridMeta,
  selectedSlots,
  isEditMode,
  dragStart,
  slotInteractionHandlers,
  onSlotRelease,
}: WeekGridRowProps) {
  return (
    <View style={styles.unifiedRow}>
      {/* Метка времени в той же строке, что и ячейки дней — единый вертикальный скролл без desync. */}
      <View style={styles.timeSlot}>
        {timeSlot.minute === 0 ? <Text style={styles.timeLabel}>{timeSlot.label}</Text> : null}
      </View>
      <View style={styles.gridRow}>
      {weekDateStrings.map((dateStr) => {
        const key = slotKeyFromParts(dateStr, timeSlot.hour, timeSlot.minute);
        return (
          <View key={key} style={styles.dayColumn}>
            <WeekSlotCell
              testID={`week-slot-${dateStr}-${timeSlot.hour}-${timeSlot.minute}`}
              isAvailable={slotGridMeta.availability.get(key) ?? false}
              isSelected={selectedSlots.has(key)}
              onPress={slotInteractionHandlers.onPress.get(key)!}
              onLongPress={slotInteractionHandlers.onLongPress.get(key)!}
              onPressIn={
                isEditMode && dragStart ? slotInteractionHandlers.onPressIn.get(key) : undefined
              }
              onPressOut={isEditMode ? onSlotRelease : undefined}
            />
          </View>
        );
      })}
      </View>
    </View>
  );
}, weekGridRowPropsEqual);

type WeekBookingLayout = {
  booking: Booking;
  date: string;
  dayIndex: number;
  startMinute: number;
  endMinute: number;
};

type WeekGridScrollProps = React.ComponentProps<typeof ScrollView> & {
  bookingLayouts: WeekBookingLayout[];
  isEditMode: boolean;
  onBookingPress: (date: string) => void;
  gridHeight: number;
};

/**
 * VirtualizedList replaces children of the element returned by renderScrollComponent.
 * This wrapper reads those replaced cells and paints the booking overlay beside them
 * inside one ScrollView, forwarding the list ref onto that ScrollView.
 */
const WeekGridScroll = React.forwardRef<ScrollView, WeekGridScrollProps>(function WeekGridScroll(
  { children, bookingLayouts, isEditMode, onBookingPress, gridHeight, ...scrollProps },
  ref,
) {
  return (
    <ScrollView ref={ref} {...scrollProps}>
      {children}
      <View
        testID="week-booking-layer"
        pointerEvents="box-none"
        style={[styles.bookingLayer, { height: gridHeight }]}
      >
        {bookingLayouts.map(({ booking, date, dayIndex, startMinute, endMinute }) => (
          <Pressable
            key={booking.id}
            testID={`week-booking-${booking.id}`}
            pointerEvents={isEditMode ? 'none' : 'auto'}
            onPress={() => onBookingPress(date)}
            style={[
              styles.slotBooked,
              styles.bookingBlock,
              {
                position: 'absolute',
                top: startMinute * PIXELS_PER_MINUTE,
                height: (endMinute - startMinute) * PIXELS_PER_MINUTE,
                left: 60 + dayIndex * DAY_COLUMN_WIDTH,
                width: DAY_COLUMN_WIDTH - 1,
                zIndex: 2,
                elevation: 2,
              },
            ]}
          >
            <Text style={styles.bookingTime} numberOfLines={1}>
              {new Date(booking.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Text style={styles.bookingService} numberOfLines={1}>{booking.service_name || ''}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
});

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
  const [actionSaving, setActionSaving] = useState(false);
  const gridScrollRef = useRef<FlatList<TimeSlotRow>>(null);
  const gridRowContextRef = useRef({
    weekDateStrings: [] as string[],
    slotGridMeta: null as unknown as SlotGridMeta,
    selectedSlots: new Set<string>(),
    isEditMode: false,
    dragStart: null as { date: string; hour: number; minute: number } | null,
    slotInteractionHandlers: null as unknown as SlotHandlers,
    onSlotRelease: () => {},
  });
  const [gridListRevision, setGridListRevision] = useState(0);
  const footerPaddingBottom = Math.max(insets.bottom, 8) + 8;
  const showEditFooter = isEditMode;

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
      const dateStr = formatLocalDate(date);
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
      const dateStr = formatLocalDate(date);
      grouped[dateStr] = bookings.filter((booking) => {
        const bookingDate = formatLocalDate(new Date(booking.start_time));
        return bookingDate === dateStr;
      });
    });
    return grouped;
  }, [bookings, weekDates]);

  const weekDateStrings = useMemo(
    () => weekDates.map((d) => formatLocalDate(d)),
    [weekDates]
  );

  // Генерируем временные слоты для всех 24 часов
  const timeSlots = useMemo(() => {
    const slots: Array<{ hour: number; minute: number; label: string }> = [];
    for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
      for (let minute of [0, 30]) {
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

  /** Фоновая доступность не зависит от геометрии карточек записей. */
  const slotGridMeta = useMemo(() => {
    const availability = new Map<string, boolean>();

    for (const dateStr of weekDateStrings) {
      const daySlots = slotsByDay[dateStr] || [];
      for (const s of daySlots) {
        availability.set(
          slotKeyFromParts(dateStr, s.hour, s.minute),
          !!(s.is_available ?? s.is_working)
        );
      }
    }
    return { availability };
  }, [weekDateStrings, slotsByDay]);

  const bookingLayouts = useMemo(() => weekDateStrings.flatMap((date, dayIndex) =>
    (bookingsByDay[date] || []).flatMap((booking) => {
      const start = new Date(booking.start_time);
      const duration = (new Date(booking.end_time).getTime() - start.getTime()) / 60000;
      const startMinute = start.getHours() * 60 + start.getMinutes() + start.getSeconds() / 60;
      const endMinute = Math.min(1440, startMinute + duration);
      if (!Number.isFinite(startMinute) || !Number.isFinite(duration) || duration <= 0) return [];
      return [{ booking, date, dayIndex, startMinute, endMinute }];
    })
  ), [weekDateStrings, bookingsByDay]);

  const initialScrollIndex = useMemo(() => {
    const idx = timeSlots.findIndex((slot) => slot.hour === INITIAL_SCROLL_HOUR && slot.minute === 0);
    return idx >= 0 ? idx : 0;
  }, [timeSlots]);

  const initialScrollY = initialScrollIndex * TIME_SLOT_HEIGHT;

  // Форматируем дату для заголовка
  const formatWeekTitle = () => {
    const start = weekDates[0];
    const end = weekDates[6];
    const startStr = start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const endStr = end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${startStr} - ${endStr}`;
  };

  const isSlotAvailable = useCallback(
    (date: string, hour: number, minute: number): boolean =>
      slotGridMeta.availability.get(slotKeyFromParts(date, hour, minute)) ?? false,
    [slotGridMeta.availability]
  );

  // Получаем все bookings для дня (для отображения в Day Drawer)
  const getDayBookings = (date: string): Booking[] => {
    return bookingsByDay[date] || [];
  };

  const handleDayPress = useCallback((date: string) => {
    if (!isEditMode) {
      setSelectedDate(date);
    }
  }, [isEditMode]);

  const handleCloseDayDrawer = useCallback(() => {
    setSelectedDate(null);
  }, []);

  // VirtualizedList делает cloneElement(renderScrollComponent(props), { ref }, cells)
  // и выбрасывает children, которые были у возвращённого элемента. Overlay должен
  // рисоваться компонентом уже из подставленных cells, в том же ScrollView.
  const renderGridScroll = useCallback((props: React.ComponentProps<typeof ScrollView>) => (
    <WeekGridScroll
      {...props}
      bookingLayouts={bookingLayouts}
      isEditMode={isEditMode}
      onBookingPress={handleDayPress}
      gridHeight={timeSlots.length * TIME_SLOT_HEIGHT}
    />
  ), [bookingLayouts, handleDayPress, isEditMode, timeSlots.length]);

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
      const dateStr = formatLocalDate(currentDate);
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
    if (!isEditMode || !editAction || editAction === 'clear' || selectedSlots.size === 0) return;
    
    // Применяем действие к выбранным слотам
    applyActionToSelectedSlots(editAction);
  };

  // Применение действия к выбранным слотам с автоматическим сохранением
  const applyActionToSelectedSlots = async (action: 'open' | 'close') => {
    if (selectedSlots.size === 0 || actionSaving) return;

    const previousSchedule = localSchedule;
    const updatedSlots = localSchedule.slots.map((slot) => {
      const key = `${slot.date || slot.schedule_date}_${slot.hour}_${slot.minute}`;
      if (selectedSlots.has(key)) {
        return {
          ...slot,
          is_available: action === 'open',
          is_working: action === 'open',
        };
      }
      return slot;
    });

    const nextSchedule = { ...localSchedule, slots: updatedSlots };
    setLocalSchedule(nextSchedule);
    setSelectedSlots(new Set());
    setDragStart(null);
    setEditAction(null);

    setActionSaving(true);
    try {
      const slotsToSave = buildWeeklyOpenSlotsPayload(updatedSlots);
      await apiClient.put('/api/master/schedule/weekly', { slots: slotsToSave });
      await onScheduleUpdated?.();
    } catch (error: unknown) {
      console.error('Ошибка автоматического сохранения:', error);
      setLocalSchedule(previousSchedule);
      const ax = error as { response?: { data?: { detail?: string } }; message?: string };
      const detail = ax?.response?.data?.detail;
      Alert.alert(
        'Ошибка',
        typeof detail === 'string' ? detail : ax?.message || 'Не удалось сохранить изменения'
      );
    } finally {
      setActionSaving(false);
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

  const handleSlotPressRef = useRef(handleSlotPress);
  handleSlotPressRef.current = handleSlotPress;
  const handleSlotLongPressRef = useRef(handleSlotLongPress);
  handleSlotLongPressRef.current = handleSlotLongPress;
  const handleSlotMoveRef = useRef(handleSlotMove);
  handleSlotMoveRef.current = handleSlotMove;
  const handleSlotReleaseRef = useRef(handleSlotRelease);
  handleSlotReleaseRef.current = handleSlotRelease;

  const slotInteractionHandlers = useMemo(() => {
    const onPress = new Map<string, () => void>();
    const onLongPress = new Map<string, () => void>();
    const onPressIn = new Map<string, () => void>();
    for (const dateStr of weekDateStrings) {
      for (const timeSlot of timeSlots) {
        const key = slotKeyFromParts(dateStr, timeSlot.hour, timeSlot.minute);
        onPress.set(key, () => {
          handleSlotPressRef.current(dateStr, timeSlot.hour, timeSlot.minute);
        });
        onLongPress.set(key, () => {
          handleSlotLongPressRef.current(dateStr, timeSlot.hour, timeSlot.minute);
        });
        onPressIn.set(key, () => {
          handleSlotMoveRef.current(dateStr, timeSlot.hour, timeSlot.minute);
        });
      }
    }
    return { onPress, onLongPress, onPressIn };
  }, [weekDateStrings, timeSlots]);

  const stableSlotRelease = useCallback(() => {
    handleSlotReleaseRef.current();
  }, []);

  gridRowContextRef.current = {
    weekDateStrings: weekDateStrings,
    slotGridMeta,
    selectedSlots,
    isEditMode,
    dragStart,
    slotInteractionHandlers,
    onSlotRelease: stableSlotRelease,
  };

  useEffect(() => {
    setGridListRevision((v) => v + 1);
  }, [slotGridMeta, selectedSlots, isEditMode, dragStart, slotInteractionHandlers, weekDateStrings]);

  const renderWeekGridRow = useCallback(({ item: timeSlot }: { item: TimeSlotRow }) => {
    const ctx = gridRowContextRef.current;
    return (
      <WeekGridRow
        timeSlot={timeSlot}
        weekDateStrings={ctx.weekDateStrings}
        slotGridMeta={ctx.slotGridMeta}
        selectedSlots={ctx.selectedSlots}
        isEditMode={ctx.isEditMode}
        dragStart={ctx.dragStart}
        slotInteractionHandlers={ctx.slotInteractionHandlers}
        onSlotRelease={ctx.onSlotRelease}
      />
    );
  }, []);

  const weekGridKeyExtractor = useCallback(
    (item: TimeSlotRow) => `${item.hour}-${item.minute}`,
    []
  );

  const getWeekRowLayout = useCallback(
    (_: ArrayLike<TimeSlotRow> | null | undefined, index: number) => ({
      length: TIME_SLOT_HEIGHT,
      offset: TIME_SLOT_HEIGHT * index,
      index,
    }),
    []
  );

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
          const date: unknown = slot.date || slot.schedule_date;
          const hour = slot.hour !== undefined ? slot.hour : parseInt((slot.start_time || '0:0').split(':')[0]);
          const minute = slot.minute !== undefined ? slot.minute : parseInt((slot.start_time || '0:0').split(':')[1]);
          
          // Убеждаемся, что дата в формате YYYY-MM-DD
          let dateStr = date as string;
          if (date instanceof Date) {
            dateStr = formatLocalDate(date);
          } else if (typeof date === 'string') {
            // Проверяем формат даты
            const dateMatch = date.match(/^\d{4}-\d{2}-\d{2}/);
            if (!dateMatch) {
              // Пытаемся преобразовать
              const dateObj = new Date(date);
              if (!isNaN(dateObj.getTime())) {
                dateStr = formatLocalDate(dateObj);
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
            is_frozen: isIosFreeCompanion(Platform.OS) ? false : Boolean(slot.is_frozen),
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
        <View style={styles.headerActions}>
          {!isEditMode ? (
            <TouchableOpacity onPress={() => setIsEditMode(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.editHeaderButton}>Изменить</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => onWeekChange(0)}>
            <Text style={styles.todayButton}>Сегодня</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/*
        Одна вертикальная FlatList: метка времени и 7 дневных ячеек в одной строке (WeekGridRow).
        Раньше отдельный ScrollView для шкалы времени + sync через scrollTo давал рассинхрон
        при быстром скролле (запись 06:00 визуально у 21:00). Не возвращать dual-scroll.
      */}
      <View style={styles.gridContainer}>
        <View style={styles.weekHeaderRow}>
          <View style={styles.timeHeaderSpacer} />
          <View style={styles.daysHeaderSticky}>
            {weekDates.map((date, index) => {
              const dateStr = formatLocalDate(date);
              const dayName = date.toLocaleDateString('ru-RU', { weekday: 'short' });
              const dayNumber = date.getDate();
              const isToday = dateStr === formatLocalDate(new Date());

              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.dayHeader, isToday && styles.dayHeaderToday]}
                  onPress={() => handleDayPress(dateStr)}
                >
                  <Text style={[styles.dayName, isToday && styles.dayNameToday]}>{dayName}</Text>
                  <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{dayNumber}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <FlatList
          ref={gridScrollRef}
          data={timeSlots}
          extraData={gridListRevision}
          keyExtractor={weekGridKeyExtractor}
          renderItem={renderWeekGridRow}
          renderScrollComponent={renderGridScroll}
          getItemLayout={getWeekRowLayout}
          initialScrollIndex={initialScrollIndex}
          onScrollToIndexFailed={() => {
            gridScrollRef.current?.scrollToOffset({
              offset: initialScrollY,
              animated: false,
            });
          }}
          showsVerticalScrollIndicator
          scrollsToTop={false}
          style={styles.gridScroll}
          contentContainerStyle={showEditFooter ? styles.daysScrollContentWithFooter : styles.daysScrollContent}
          removeClippedSubviews={false}
          refreshControl={refreshControl}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={50}
        />
      </View>

      {/* Панель инструментов — только в режиме редактирования */}
      {showEditFooter ? (
        <View style={[styles.editToolbar, { paddingBottom: footerPaddingBottom }]}>
          <View style={styles.toolbarRow}>
            <TouchableOpacity
              style={[
                styles.toolbarButton,
                styles.toolbarButtonPrimary,
                (actionSaving || selectedSlots.size === 0) && styles.toolbarButtonDisabled,
              ]}
              disabled={actionSaving || selectedSlots.size === 0}
              onPress={async () => {
                if (selectedSlots.size === 0) {
                  Alert.alert('Предупреждение', 'Выберите слоты для открытия');
                  return;
                }
                saveStateForUndo();
                await applyActionToSelectedSlots('open');
              }}
            >
              <Text style={styles.toolbarButtonText}>
                {actionSaving ? '…' : 'Открыть'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toolbarButton,
                styles.toolbarButtonDanger,
                (actionSaving || selectedSlots.size === 0) && styles.toolbarButtonDisabled,
              ]}
              disabled={actionSaving || selectedSlots.size === 0}
              onPress={async () => {
                if (selectedSlots.size === 0) {
                  Alert.alert('Предупреждение', 'Выберите слоты для закрытия');
                  return;
                }
                saveStateForUndo();
                await applyActionToSelectedSlots('close');
              }}
            >
              <Text style={styles.toolbarButtonText}>
                {actionSaving ? '…' : 'Закрыть'}
              </Text>
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
      ) : null}

      {/* Day Drawer */}
      {selectedDate && (
        <DayDrawer
          visible={!!selectedDate}
          date={selectedDate}
          bookings={getDayBookings(selectedDate)}
          slots={slotsByDay[selectedDate] || []}
          onClose={handleCloseDayDrawer}
          onCancelSuccess={onScheduleUpdated}
          onScheduleUpdated={onScheduleUpdated}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editHeaderButton: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  todayButton: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  gridContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  weekHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  timeHeaderSpacer: {
    width: 60,
    height: 60,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  daysHeaderSticky: {
    flex: 1,
    flexDirection: 'row',
    height: 60,
    backgroundColor: '#fff',
  },
  gridScroll: {
    flex: 1,
  },
  unifiedRow: {
    flexDirection: 'row',
    height: TIME_SLOT_HEIGHT,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  daysScrollContent: {
    paddingBottom: 0,
  },
  daysScrollContentWithFooter: {
    paddingBottom: 8,
  },
  timeSlot: {
    width: 60,
    height: TIME_SLOT_HEIGHT,
    justifyContent: 'flex-start',
    paddingLeft: 8,
    paddingTop: 4,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
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
  gridRow: {
    flex: 1,
    flexDirection: 'row',
    height: TIME_SLOT_HEIGHT,
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
    padding: 2,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bookingLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    elevation: 2,
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
  toolbarButtonDisabled: {
    opacity: 0.55,
  },
});
