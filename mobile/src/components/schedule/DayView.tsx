import React, { useState, useMemo, useEffect, type ReactElement } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScheduleWeek, Booking, ScheduleSlot, MasterSettings } from '@src/services/api/master';
import { DayDrawer } from './DayDrawer';

interface DayViewProps {
  schedule: ScheduleWeek;
  bookings: Booking[];
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  /** Как во WeekView — для DayDrawer (подтверждение/авто-подтверждение) */
  masterSettings?: MasterSettings | null;
  /** Обновить данные после действий в DayDrawer */
  onScheduleUpdated?: () => void;
  refreshControl?: ReactElement;
  hasExtendedStats?: boolean;
}

const TIME_SLOT_HEIGHT = 60; // Высота слота 30 минут
const INITIAL_SCROLL_HOUR = 7; // Начальная позиция скролла - 7:00

function formatServicePrice(price: number | null | undefined): string | null {
  if (price == null || Number.isNaN(Number(price))) return null;
  return `${Math.round(Number(price)).toLocaleString('ru-RU')} ₽`;
}

export function DayView({
  schedule,
  bookings,
  weekOffset,
  onWeekChange,
  masterSettings,
  onScheduleUpdated,
  refreshControl,
  hasExtendedStats = false,
}: DayViewProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDrawerVisible, setDayDrawerVisible] = useState(false);

  // Вычисляем даты текущей недели
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
      grouped[dateStr] = schedule.slots.filter(
        (slot) => (slot.date || slot.schedule_date) === dateStr
      );
    });
    return grouped;
  }, [schedule.slots, weekDates]);

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

  // Находим начальный день: сегодня, если доступен для записи, иначе ближайший рабочий день в будущем
  const getInitialDate = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Проверяем, есть ли рабочие слоты сегодня
    const todaySlots = slotsByDay[todayStr] || [];
    const hasWorkingToday = todaySlots.some(slot => slot.is_working || slot.is_available);
    
    if (hasWorkingToday) {
      return todayStr;
    }
    
    // Ищем ближайший рабочий день в будущем
    for (let i = 0; i < 365; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i + 1);
      const dateStr = date.toISOString().split('T')[0];
      
      // Если день в текущей неделе, проверяем слоты из schedule
      if (slotsByDay[dateStr]) {
        const daySlots = slotsByDay[dateStr];
        if (daySlots.some(slot => slot.is_working || slot.is_available)) {
          return dateStr;
        }
      }
    }
    
    // Если не нашли, возвращаем сегодня
    return todayStr;
  }, [slotsByDay]);

  // Инициализируем selectedDate при первой загрузке
  useEffect(() => {
    if (!selectedDate) {
      setSelectedDate(getInitialDate);
    }
  }, [getInitialDate, selectedDate]);

  // Текущая дата для отображения
  const currentDate = selectedDate || getInitialDate;
  const currentDateObj = new Date(currentDate);
  
  // Получаем слоты для текущего дня
  const daySlots = useMemo(() => {
    return slotsByDay[currentDate] || [];
  }, [slotsByDay, currentDate]);

  // Получаем bookings для текущего дня
  const dayBookings = useMemo(() => {
    return bookingsByDay[currentDate] || [];
  }, [bookingsByDay, currentDate]);

  // Генерируем временные слоты для всех 24 часов
  const timeSlots = useMemo(() => {
    const slots: Array<{ hour: number; minute: number; label: string }> = [];
    for (let hour = 0; hour <= 23; hour++) {
      for (let minute of [0, 30]) {
        if (hour === 23 && minute === 30) break;
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

  // Проверяем, доступен ли слот
  const isSlotAvailable = (hour: number, minute: number): boolean => {
    return daySlots.some(
      (slot) => slot.hour === hour && slot.minute === minute && (slot.is_working || slot.is_available)
    );
  };

  // Находим booking для слота
  const getBookingForSlot = (hour: number, minute: number): Booking | undefined => {
    const slotStart = new Date(currentDateObj);
    slotStart.setHours(hour, minute, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + 30);

    return dayBookings.find((booking) => {
      const bookingStart = new Date(booking.start_time);
      const bookingEnd = new Date(booking.end_time);
      return bookingStart < slotEnd && bookingEnd > slotStart;
    });
  };

  // Вычисляем статистику дня
  const stats = useMemo(() => {
    const availableSlots = daySlots.filter(s => s.is_working || s.is_available).length;
    const availableHours = (availableSlots * 30) / 60; // В часах
    const bookedHours = dayBookings.reduce((sum, booking) => {
      const duration = (new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()) / (1000 * 60);
      return sum + duration;
    }, 0) / 60; // В часах
    const bookingsCount = dayBookings.length;

    return {
      availableHours,
      bookedHours,
      bookingsCount,
    };
  }, [daySlots, dayBookings]);

  // Навигация по дням
  const handlePrevDay = () => {
    const date = new Date(currentDateObj);
    date.setDate(date.getDate() - 1);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const date = new Date(currentDateObj);
    date.setDate(date.getDate() + 1);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    const today = new Date();
    setSelectedDate(today.toISOString().split('T')[0]);
  };

  const handleCalendar = () => {
    // TODO: Открыть календарь для выбора даты
    // Пока просто переключаем на сегодня
    handleToday();
  };

  // Форматируем дату для заголовка
  const formatDateTitle = () => {
    const dayName = currentDateObj.toLocaleDateString('ru-RU', { weekday: 'long' });
    const dayNumber = currentDateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    return `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${dayNumber}`;
  };

  // Вычисляем начальную позицию скролла (7:00)
  const initialScrollY = useMemo(() => {
    const initialIndex = timeSlots.findIndex(slot => slot.hour === INITIAL_SCROLL_HOUR && slot.minute === 0);
    return initialIndex >= 0 ? initialIndex * TIME_SLOT_HEIGHT : 0;
  }, [timeSlots]);

  return (
    <View style={styles.container}>
      {/* Верхняя панель с навигацией */}
      <View style={styles.header}>
        <View style={styles.navButtons}>
          <Pressable
            onPress={handlePrevDay}
            style={({ pressed }) => [styles.navArrowBtn, pressed && styles.navArrowBtnPressed]}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Предыдущий день"
          >
            <Ionicons name="chevron-back" size={26} color="#333" />
          </Pressable>
          <TouchableOpacity onPress={handleToday} style={styles.navTodayBtn} accessibilityLabel="Сегодня">
            <Text style={styles.navTodayText}>Сегодня</Text>
          </TouchableOpacity>
          <Pressable
            onPress={handleNextDay}
            style={({ pressed }) => [styles.navArrowBtn, pressed && styles.navArrowBtnPressed]}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Следующий день"
          >
            <Ionicons name="chevron-forward" size={26} color="#333" />
          </Pressable>
          <TouchableOpacity onPress={handleCalendar} style={styles.calendarButton} accessibilityLabel="Календарь, перейти на сегодня">
            <Ionicons name="calendar-outline" size={22} color="#333" />
          </TouchableOpacity>
        </View>
        <Text style={styles.dateTitle}>{formatDateTitle()}</Text>
      </View>

      {/* Статистика дня */}
      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Доступно</Text>
          <Text style={styles.statValue}>{stats.availableHours.toFixed(1)} ч</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Занято</Text>
          <Text style={styles.statValue}>{stats.bookedHours.toFixed(1)} ч</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Записей</Text>
          <Text style={styles.statValue}>{stats.bookingsCount}</Text>
        </View>
      </View>

      {/* Таймлайн дня */}
      <ScrollView
        style={styles.timeline}
        contentContainerStyle={styles.timelineContent}
        contentOffset={{ x: 0, y: initialScrollY }}
        showsVerticalScrollIndicator={true}
        refreshControl={refreshControl}
      >
        {timeSlots.map((timeSlot, index) => {
          const isAvailable = isSlotAvailable(timeSlot.hour, timeSlot.minute);
          const booking = getBookingForSlot(timeSlot.hour, timeSlot.minute);
          const isFirstInHour = timeSlot.minute === 0;

          return (
            <View key={index} style={styles.timeSlot}>
              <View style={styles.timeLabel}>
                {isFirstInHour && (
                  <Text style={styles.timeText}>{timeSlot.label}</Text>
                )}
              </View>
              <TouchableOpacity
                activeOpacity={0.75}
                style={[styles.slotContent, isAvailable && styles.slotAvailable, booking && styles.slotBooked]}
                onPress={() => setDayDrawerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Открыть день"
              >
                {booking ? (
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
                    <View style={styles.bookingClientRow}>
                      <Text style={styles.bookingClient} numberOfLines={1}>
                        {booking.client_name}
                      </Text>
                      {formatServicePrice(booking.service_price) ? (
                        <Text style={styles.bookingPriceInline} numberOfLines={1}>
                          {formatServicePrice(booking.service_price)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : isAvailable ? (
                  <View style={styles.freeSlot}>
                    <Text style={styles.freeSlotText}>Свободно</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      <DayDrawer
        visible={dayDrawerVisible}
        date={currentDate}
        bookings={dayBookings}
        slots={daySlots}
        onClose={() => setDayDrawerVisible(false)}
        onCancelSuccess={onScheduleUpdated}
        onScheduleUpdated={onScheduleUpdated}
        masterSettings={masterSettings}
        hasExtendedStats={hasExtendedStats}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  navButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  navArrowBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrowBtnPressed: {
    opacity: 0.7,
  },
  navTodayBtn: {
    flex: 1,
    minWidth: 100,
    maxWidth: 160,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  navTodayText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4CAF50',
  },
  calendarButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  timeline: {
    flex: 1,
  },
  timelineContent: {
    paddingBottom: 20,
  },
  timeSlot: {
    flexDirection: 'row',
    minHeight: TIME_SLOT_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  timeLabel: {
    width: 70,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'flex-start',
  },
  timeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  slotContent: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  slotAvailable: {
    backgroundColor: '#E8F5E9',
  },
  slotBooked: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  bookingBlock: {
    flex: 1,
  },
  bookingTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 4,
  },
  bookingService: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  bookingClientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 16,
  },
  bookingClient: {
    fontSize: 12,
    color: '#666',
    flex: 1,
    minWidth: 0,
  },
  bookingPriceInline: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4CAF50',
    flexShrink: 0,
  },
  freeSlot: {
    flex: 1,
    justifyContent: 'center',
  },
  freeSlotText: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '500',
  },
});