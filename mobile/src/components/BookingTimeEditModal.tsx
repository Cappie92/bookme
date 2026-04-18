import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrimaryButton } from './PrimaryButton';
import { SecondaryButton } from './SecondaryButton';
import { getAvailableSlots, updateBooking, AvailableSlot, AvailableSlotsResponse } from '@src/services/api/bookings';

interface BookingTimeEditModalProps {
  visible: boolean;
  onClose: () => void;
  bookingId: number;
  currentStartTime: string;
  serviceDuration: number;
  onBookingUpdated: () => void;
}

// Получить понедельник недели для указанной даты
const getMonday = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  return new Date(d.setDate(diff));
};

// Получить все дни недели, начиная с понедельника
const getWeekDays = (startDate: Date): Date[] => {
  const monday = getMonday(new Date(startDate));
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    days.push(day);
  }
  return days;
};

// Форматировать дату в YYYY-MM-DD
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Форматировать дату для отображения
const formatDisplayDate = (date: Date): string => {
  const day = date.getDate();
  const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const weekdayNames = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  const weekday = weekdayNames[date.getDay() === 0 ? 6 : date.getDay() - 1];
  return `${weekday} ${day} ${monthNames[date.getMonth()]}`;
};

export function BookingTimeEditModal({
  visible,
  onClose,
  bookingId,
  currentStartTime,
  serviceDuration,
  onBookingUpdated,
}: BookingTimeEditModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [slotsData, setSlotsData] = useState<AvailableSlotsResponse | null>(null);
  /** По дате (YYYY-MM-DD) есть ли слоты — для серой подсветки дней без слотов (как в web) */
  const [dateAvailability, setDateAvailability] = useState<Record<string, boolean>>({});
  const [weekAvailabilityLoading, setWeekAvailabilityLoading] = useState(false);

  // Инициализация: устанавливаем текущую дату бронирования
  useEffect(() => {
    if (visible && currentStartTime) {
      const currentDate = new Date(currentStartTime);
      setSelectedDate(currentDate);
      setCurrentWeek(0);
      setSelectedSlot(null);
      setAvailableSlots([]);
      setSlotsData(null);
      setDateAvailability({});
      loadSlotsForDate(currentDate);
    }
  }, [visible, currentStartTime]);

  // Загрузка доступности по дням недели (как в web: даты без слотов показываем серыми)
  const loadWeekAvailability = async () => {
    if (!visible || !bookingId) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = getMonday(today);
    const targetMonday = new Date(monday);
    targetMonday.setDate(monday.getDate() + currentWeek * 7);
    const weekDays = getWeekDays(targetMonday);
    setWeekAvailabilityLoading(true);
    const next: Record<string, boolean> = {};
    try {
      const results = await Promise.all(
        weekDays.map(async (day) => {
          const dateStr = formatDate(day);
          const dayStart = new Date(day);
          dayStart.setHours(0, 0, 0, 0);
          if (dayStart < today) {
            return { dateStr, hasSlots: false };
          }
          try {
            const data = await getAvailableSlots(bookingId, dateStr);
            const hasSlots = !!(data.available_slots && data.available_slots.length > 0);
            return { dateStr, hasSlots };
          } catch {
            return { dateStr, hasSlots: false };
          }
        })
      );
      results.forEach((r) => { next[r.dateStr] = r.hasSlots; });
      setDateAvailability(next);
    } finally {
      setWeekAvailabilityLoading(false);
    }
  };

  useEffect(() => {
    if (visible && bookingId) {
      loadWeekAvailability();
    }
  }, [visible, bookingId, currentWeek]);

  const loadSlotsForDate = async (date: Date) => {
    setSlotsLoading(true);
    setSelectedSlot(null);
    setAvailableSlots([]);
    
    try {
      const dateStr = formatDate(date);
      const data = await getAvailableSlots(bookingId, dateStr);
      setSlotsData(data);
      setAvailableSlots(data.available_slots);
    } catch (error: any) {
      console.error('Ошибка загрузки слотов:', error);
      Alert.alert('Ошибка', 'Не удалось загрузить доступные слоты времени');
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    loadSlotsForDate(date);
  };

  const handleSlotSelect = (slot: AvailableSlot) => {
    setSelectedSlot(slot);
  };

  const handleUpdate = async () => {
    if (!selectedSlot || !selectedDate) {
      Alert.alert('Ошибка', 'Выберите дату и время');
      return;
    }

    setUpdating(true);
    try {
      await updateBooking(bookingId, {
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
      });
      
      Alert.alert('Успешно', 'Время бронирования изменено');
      onBookingUpdated();
      onClose();
    } catch (error: any) {
      console.error('Ошибка обновления бронирования:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Не удалось изменить время бронирования';
      Alert.alert('Ошибка', errorMessage);
    } finally {
      setUpdating(false);
    }
  };

  const handleWeekChange = (direction: 'prev' | 'next') => {
    const newWeek = direction === 'next' ? currentWeek + 1 : currentWeek - 1;
    setCurrentWeek(newWeek);
    
    // Вычисляем дату понедельника для новой недели
    const today = new Date();
    const currentMonday = getMonday(today);
    const targetMonday = new Date(currentMonday);
    targetMonday.setDate(currentMonday.getDate() + (newWeek * 7));
    
    // Если была выбрана дата, обновляем её на соответствующую дату новой недели
    if (selectedDate) {
      const dayOfWeek = selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1;
      const newDate = new Date(targetMonday);
      newDate.setDate(targetMonday.getDate() + dayOfWeek);
      setSelectedDate(newDate);
      loadSlotsForDate(newDate);
    }
  };

  const weekDays = getWeekDays(new Date());
  const currentMonday = getMonday(new Date());
  const targetMonday = new Date(currentMonday);
  targetMonday.setDate(currentMonday.getDate() + (currentWeek * 7));
  const displayWeekDays = getWeekDays(targetMonday);

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.centeredView}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>Изменить время записи</Text>

          {/* Навигация по неделям */}
          <View style={styles.weekNavigation}>
            <TouchableOpacity
              onPress={() => handleWeekChange('prev')}
              style={styles.weekNavButton}
            >
              <Ionicons name="chevron-back" size={24} color="#4CAF50" />
            </TouchableOpacity>
            <Text style={styles.weekTitle}>
              {targetMonday.getDate()} {['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][targetMonday.getMonth()]} - 
              {new Date(targetMonday.getTime() + 6 * 24 * 60 * 60 * 1000).getDate()} {['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][new Date(targetMonday.getTime() + 6 * 24 * 60 * 60 * 1000).getMonth()]}
            </Text>
            <TouchableOpacity
              onPress={() => handleWeekChange('next')}
              style={styles.weekNavButton}
            >
              <Ionicons name="chevron-forward" size={24} color="#4CAF50" />
            </TouchableOpacity>
          </View>

          {/* Календарь - дни недели (даты без слотов — серые, как в web) */}
          <View style={styles.calendarContainer}>
            {displayWeekDays.map((day, index) => {
              const dateStr = formatDate(day);
              const isSelected = selectedDate && dateStr === formatDate(selectedDate);
              const isToday = dateStr === formatDate(new Date());
              const hasSlots = dateAvailability[dateStr];
              const todayStr = formatDate(new Date());
              const isPast = dateStr < todayStr;
              const noSlots = hasSlots === false;
              const showGray = isPast || noSlots;
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dayButton,
                    isSelected && styles.dayButtonSelected,
                    isToday && !isSelected && styles.dayButtonToday,
                    showGray && styles.dayButtonNoSlots,
                  ]}
                  onPress={() => handleDateSelect(day)}
                >
                  <Text style={[
                    styles.dayWeekday,
                    isSelected && styles.dayWeekdaySelected,
                    showGray && !isSelected && styles.dayWeekdayNoSlots,
                  ]}>
                    {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][index]}
                  </Text>
                  <Text style={[
                    styles.dayNumber,
                    isSelected && styles.dayNumberSelected,
                    showGray && !isSelected && styles.dayNumberNoSlots,
                  ]}>
                    {day.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Доступные слоты времени */}
          {selectedDate && (
            <View style={styles.slotsContainer}>
              <Text style={styles.slotsTitle}>
                Доступное время {selectedDate && formatDisplayDate(selectedDate)}
              </Text>
              
              {slotsLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#4CAF50" />
                  <Text style={styles.loadingText}>Загрузка...</Text>
                </View>
              ) : availableSlots.length === 0 ? (
                <Text style={styles.noSlotsText}>Нет доступных слотов на эту дату</Text>
              ) : (
                <ScrollView style={styles.slotsList} nestedScrollEnabled={true}>
                  {availableSlots.map((slot, index) => {
                    const isSelected = selectedSlot?.start_time === slot.start_time;
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[styles.slotButton, isSelected && styles.slotButtonSelected]}
                        onPress={() => handleSlotSelect(slot)}
                      >
                        <Text style={[styles.slotText, isSelected && styles.slotTextSelected]}>
                          {slot.formatted_time}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}

          {/* Кнопки */}
          <View style={styles.buttonsContainer}>
            <SecondaryButton
              title="Отмена"
              onPress={onClose}
              disabled={updating}
              style={styles.cancelButton}
            />
            <PrimaryButton
              title={updating ? "Сохранение..." : "Сохранить"}
              onPress={handleUpdate}
              disabled={!selectedSlot || updating}
              loading={updating}
              style={styles.saveButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  weekNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  weekNavButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  weekTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  calendarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  dayButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 8,
    marginHorizontal: 2,
    backgroundColor: '#f5f5f5',
  },
  dayButtonSelected: {
    backgroundColor: '#4CAF50',
  },
  dayButtonToday: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  dayButtonNoSlots: {
    backgroundColor: '#e5e7eb',
  },
  dayWeekday: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  dayWeekdaySelected: {
    color: '#fff',
  },
  dayWeekdayNoSlots: {
    color: '#9ca3af',
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  dayNumberSelected: {
    color: '#fff',
  },
  dayNumberNoSlots: {
    color: '#9ca3af',
  },
  slotsContainer: {
    width: '100%',
    marginBottom: 20,
  },
  slotsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  noSlotsText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
    padding: 20,
  },
  slotsList: {
    maxHeight: 200,
  },
  slotButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    marginBottom: 8,
    alignItems: 'center',
  },
  slotButtonSelected: {
    backgroundColor: '#4CAF50',
  },
  slotText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  slotTextSelected: {
    color: '#fff',
  },
  buttonsContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1,
  },
});

