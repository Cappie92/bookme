import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Booking,
  ScheduleSlot,
  cancelBookingConfirmation,
  confirmBooking,
  confirmPreVisitBooking,
  updateMasterDaySchedule,
} from '@src/services/api/master';
import { getStatusLabel, getStatusColor } from '@src/services/api/bookings';
import { canCancelBooking, canPreVisitConfirmBooking, canConfirmPostVisit, debugConfirmUI } from '@src/utils/bookingOutcome';
import { CancelReasonSheet } from '@src/components/bookings/CancelReasonSheet';
import { NoteSheet } from '@src/components/bookings/NoteSheet';
import { BookingCardCompact } from '@src/components/bookings/BookingCardCompact';
import {
  SLOT_MINUTE_STEPS,
  resolveDayRangeMinutes,
  thirtyMinuteSlotsInRange,
} from '@src/utils/dayAvailabilityRange';

interface DayDrawerProps {
  visible: boolean;
  date: string;
  bookings: Booking[];
  slots: ScheduleSlot[];
  onClose: () => void;
  /** После отмены/подтверждения записи */
  onCancelSuccess?: () => void;
  /** После локального изменения слотов на день */
  onScheduleUpdated?: () => void;
  masterSettings?: { master?: { auto_confirm_bookings?: boolean; pre_visit_confirmations_enabled?: boolean } } | null;
  /** Как на дашборде: тариф с расширенной статистикой */
  hasExtendedStats?: boolean;
}

function slotKey(hour: number, minute: number): string {
  return `${hour}:${minute}`;
}

function parseSlotKey(key: string): { hour: number; minute: number } {
  const [h, m] = key.split(':').map(Number);
  return { hour: h, minute: m };
}

/** Текущие открытые слоты дня */
function openKeysFromSlots(slots: ScheduleSlot[]): Set<string> {
  const set = new Set<string>();
  slots.forEach((s) => {
    if (s.is_working || s.is_available) {
      set.add(slotKey(s.hour, s.minute));
    }
  });
  return set;
}

const HOURS_0_23 = Array.from({ length: 24 }, (_, i) => i);
const HOURS_END_0_24 = Array.from({ length: 25 }, (_, i) => i);

function ScrollPickColumn({
  values,
  selected,
  onSelect,
  format,
}: {
  values: readonly number[];
  selected: number;
  onSelect: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <ScrollView style={styles.pickCol} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {values.map((v) => (
        <TouchableOpacity
          key={v}
          style={[styles.pickItem, selected === v && styles.pickItemActive]}
          onPress={() => onSelect(v)}
          accessibilityRole="button"
        >
          <Text style={[styles.pickItemText, selected === v && styles.pickItemTextActive]}>{format(v)}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function bookingOverlapsSlot(dateStr: string, hour: number, minute: number, booking: Booking): boolean {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const slotStart = new Date(y, mo - 1, d, hour, minute, 0, 0);
  const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
  const bookingStart = new Date(booking.start_time);
  const bookingEnd = new Date(booking.end_time);
  return bookingStart < slotEnd && bookingEnd > slotStart;
}

function bookingBlocksSlotClose(booking: Booking): boolean {
  const s = String(booking.status || '').toLowerCase();
  if (
    s === 'cancelled' ||
    s === 'cancelled_by_client_early' ||
    s === 'cancelled_by_client_late' ||
    s === 'completed'
  ) {
    return false;
  }
  return true;
}

function openSlotsPayload(keys: Set<string>): Array<{ hour: number; minute: number }> {
  return Array.from(keys)
    .map(parseSlotKey)
    .sort((a, b) => a.hour - b.hour || a.minute - b.minute);
}

function getApiErrorMessage(err: unknown): string {
  const ax = err as { response?: { data?: { detail?: string } }; message?: string };
  const d = ax?.response?.data?.detail;
  if (typeof d === 'string') return d;
  return ax?.message || 'Неизвестная ошибка';
}

export function DayDrawer({
  visible,
  date,
  bookings,
  slots,
  onClose,
  onCancelSuccess,
  onScheduleUpdated,
  masterSettings,
  hasExtendedStats = false,
}: DayDrawerProps) {
  const [cancelSheetBookingId, setCancelSheetBookingId] = useState<number | null>(null);
  const [noteSheetBooking, setNoteSheetBooking] = useState<Booking | null>(null);
  const [saving, setSaving] = useState(false);
  const [closePickerVisible, setClosePickerVisible] = useState(false);
  /** Ключи слотов, которые пользователь хочет закрыть */
  const [keysToClose, setKeysToClose] = useState<Set<string>>(() => new Set());
  const [openRangeVisible, setOpenRangeVisible] = useState(false);
  const [rangeStartH, setRangeStartH] = useState(9);
  const [rangeStartM, setRangeStartM] = useState(0);
  const [rangeEndH, setRangeEndH] = useState(18);
  const [rangeEndM, setRangeEndM] = useState(0);

  const dateObj = new Date(date);

  const handleConfirm = async (bookingId: number, booking: Booking) => {
    const master = masterSettings?.master ?? null;
    const isPreVisit = canPreVisitConfirmBooking(booking, master, new Date(), hasExtendedStats);
    try {
      if (isPreVisit) {
        await confirmPreVisitBooking(bookingId);
      } else {
        await confirmBooking(bookingId);
      }
      onCancelSuccess?.();
    } catch (err: unknown) {
      Alert.alert('Ошибка', getApiErrorMessage(err));
    }
  };

  const handleCancelWithReason = async (bookingId: number, reason: string) => {
    try {
      await cancelBookingConfirmation(bookingId, reason as any);
      onCancelSuccess?.();
    } catch (err: unknown) {
      Alert.alert('Ошибка', getApiErrorMessage(err));
      throw err;
    }
  };

  const sortedBookings = useMemo(
    () => [...bookings].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
    [bookings]
  );

  const openKeys = useMemo(() => openKeysFromSlots(slots), [slots]);

  const closableSlots = useMemo(() => {
    return slots.filter((s) => {
      if (!(s.is_working || s.is_available)) return false;
      const blocked = sortedBookings.some(
        (b) => bookingBlocksSlotClose(b) && bookingOverlapsSlot(date, s.hour, s.minute, b)
      );
      return !blocked;
    });
  }, [slots, sortedBookings, date]);

  const submitOpenKeys = async (next: Set<string>) => {
    setSaving(true);
    try {
      await updateMasterDaySchedule(date, openSlotsPayload(next));
      onScheduleUpdated?.();
      onClose();
    } catch (err: unknown) {
      Alert.alert('Не удалось сохранить', getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openAvailabilityPicker = () => {
    if (saving) return;
    setRangeStartH(9);
    setRangeStartM(0);
    setRangeEndH(18);
    setRangeEndM(0);
    setOpenRangeVisible(true);
  };

  const applyOpenAvailabilityRange = () => {
    if (saving) return;
    const resolved = resolveDayRangeMinutes(rangeStartH, rangeStartM, rangeEndH, rangeEndM);
    if (!resolved.ok) {
      Alert.alert('Проверьте время', resolved.error);
      return;
    }
    const { startMin, endMin } = resolved;
    const gridSlots = thirtyMinuteSlotsInRange(startMin, endMin);
    const next = new Set(openKeys);
    let newlyAdded = 0;
    for (const { hour, minute } of gridSlots) {
      const k = slotKey(hour, minute);
      if (!next.has(k)) newlyAdded += 1;
      next.add(k);
    }
    if (newlyAdded === 0) {
      Alert.alert(
        'Нет изменений',
        'Все слоты в выбранном интервале на этот день уже открыты. Укажите другой интервал или расширьте его.'
      );
      setOpenRangeVisible(false);
      return;
    }
    setOpenRangeVisible(false);
    void submitOpenKeys(next);
  };

  const openClosePicker = () => {
    if (closableSlots.length === 0) {
      Alert.alert(
        'Нет слотов для закрытия',
        'Свободных открытых окон без записей на этот день нет. Сначала откройте доступность или выберите другой день.'
      );
      return;
    }
    setKeysToClose(new Set());
    setClosePickerVisible(true);
  };

  const applyCloseSlots = () => {
    if (saving) return;
    if (keysToClose.size === 0) {
      setClosePickerVisible(false);
      return;
    }
    const next = new Set(openKeys);
    keysToClose.forEach((k) => next.delete(k));
    setClosePickerVisible(false);
    setKeysToClose(new Set());
    void submitOpenKeys(next);
  };

  const dayName = dateObj.toLocaleDateString('ru-RU', { weekday: 'long' });
  const dayNumber = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  const availableSlots = slots.filter((s) => s.is_available ?? s.is_working).length;
  const totalSlots = slots.length;
  const availableHours = (availableSlots * 30) / 60;
  const bookedHours =
    bookings.reduce((sum, booking) => {
      const duration =
        (new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()) / (1000 * 60);
      return sum + duration;
    }, 0) / 60;

  const toggleCloseKey = (key: string, value: boolean) => {
    setKeysToClose((prev) => {
      const n = new Set(prev);
      if (value) n.add(key);
      else n.delete(key);
      return n;
    });
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
          <TouchableOpacity style={styles.overlayTouchable} activeOpacity={1} onPress={onClose} />
          <View style={styles.container}>
            <SafeAreaView style={styles.safeArea} edges={['top']}>
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>{dayName.charAt(0).toUpperCase() + dayName.slice(1)}</Text>
                  <Text style={styles.subtitle}>{dayNumber}</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={22} color="#666" />
                </TouchableOpacity>
              </View>

              <View style={styles.summary}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Доступно</Text>
                  <Text style={styles.summaryValue}>{availableHours.toFixed(1)} ч</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Занято</Text>
                  <Text style={styles.summaryValue}>{bookedHours.toFixed(1)} ч</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Записей</Text>
                  <Text style={styles.summaryValue}>{bookings.length}</Text>
                </View>
              </View>

              <ScrollView
                style={styles.timeline}
                contentContainerStyle={styles.timelineContent}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {sortedBookings.length === 0 && availableSlots === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>Нет записей и доступных слотов</Text>
                  </View>
                ) : (
                  <>
                    {sortedBookings.map((booking) => {
                      const master = masterSettings?.master ?? null;
                      const showConfirm =
                        canPreVisitConfirmBooking(booking, master, new Date(), hasExtendedStats) ||
                        canConfirmPostVisit(booking, master);
                      debugConfirmUI(booking, master, 'DayDrawer');
                      return (
                        <BookingCardCompact
                          key={booking.id}
                          booking={booking}
                          statusLabel={getStatusLabel(booking.status as any)}
                          statusColor={getStatusColor(booking.status as any)}
                          showConfirm={showConfirm}
                          onPressConfirm={() => handleConfirm(booking.id, booking)}
                          onPressCancel={() => setCancelSheetBookingId(booking.id)}
                          onNotePress={(b) => setNoteSheetBooking(b)}
                        />
                      );
                    })}

                    {availableSlots > 0 && (
                      <View style={styles.freeSlotsSection}>
                        <Text style={styles.freeSlotsTitle}>Свободные окна</Text>
                        <Text style={styles.freeSlotsText}>
                          Доступно {availableHours.toFixed(1)} часов для записи
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionButton, saving && styles.actionButtonDisabled]}
                  onPress={openAvailabilityPicker}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.actionButtonText}>Открыть слот</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonSecondary, saving && styles.actionButtonDisabled]}
                  onPress={openClosePicker}
                  disabled={saving}
                >
                  <Text style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>Закрыть слоты</Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </View>
        </View>
      </Modal>

      <Modal visible={openRangeVisible} transparent animationType="fade" onRequestClose={() => setOpenRangeVisible(false)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerCard, styles.rangeCard]}>
            <Text style={styles.pickerTitle}>Интервал доступности</Text>
            <Text style={styles.pickerHint}>
              Только сетка расписания: минуты :00 или :30. Открываются слоты строго внутри выбранного интервала [начало,
              конец) и добавляются к уже открытым. Правило недели не меняется.
            </Text>

            <Text style={styles.rangeSectionLabel}>Начало</Text>
            <View style={styles.rangeRow}>
              <View style={styles.rangeCol}>
                <Text style={styles.rangeColTitle}>Часы</Text>
                <ScrollPickColumn
                  values={HOURS_0_23}
                  selected={rangeStartH}
                  onSelect={setRangeStartH}
                  format={(h) => String(h).padStart(2, '0')}
                />
              </View>
              <View style={styles.rangeCol}>
                <Text style={styles.rangeColTitle}>Минуты</Text>
                <ScrollPickColumn
                  values={[...SLOT_MINUTE_STEPS]}
                  selected={rangeStartM}
                  onSelect={setRangeStartM}
                  format={(m) => String(m).padStart(2, '0')}
                />
              </View>
            </View>

            <Text style={styles.rangeSectionLabel}>Конец</Text>
            <Text style={styles.rangeEndHint}>
              Конец не входит: при «до 10:30» последний открытый слот — 10:00–10:30. Для конца дня — 24:00.
            </Text>
            <View style={styles.rangeRow}>
              <View style={styles.rangeCol}>
                <Text style={styles.rangeColTitle}>Часы</Text>
                <ScrollPickColumn
                  values={HOURS_END_0_24}
                  selected={rangeEndH}
                  onSelect={(h) => {
                    setRangeEndH(h);
                    if (h === 24) setRangeEndM(0);
                  }}
                  format={(h) => (h === 24 ? '24' : String(h).padStart(2, '0'))}
                />
              </View>
              <View style={styles.rangeCol}>
                <Text style={styles.rangeColTitle}>Минуты</Text>
                {rangeEndH === 24 ? (
                  <View style={[styles.pickCol, styles.pickColMuted]}>
                    <Text style={styles.pickItemText}>00</Text>
                  </View>
                ) : (
                  <ScrollPickColumn
                    values={[...SLOT_MINUTE_STEPS]}
                    selected={rangeEndM}
                    onSelect={setRangeEndM}
                    format={(m) => String(m).padStart(2, '0')}
                  />
                )}
              </View>
            </View>

            <View style={styles.pickerActions}>
              <TouchableOpacity style={styles.pickerBtnGhost} onPress={() => setOpenRangeVisible(false)}>
                <Text style={styles.pickerBtnGhostText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerBtnPrimary} onPress={applyOpenAvailabilityRange}>
                <Text style={styles.pickerBtnPrimaryText}>Добавить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={closePickerVisible} transparent animationType="fade" onRequestClose={() => setClosePickerVisible(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Закрыть свободные слоты</Text>
            <Text style={styles.pickerHint}>
              Отметьте 30-минутные окна, которые нужно закрыть только на этот день. Слоты с записями недоступны.
            </Text>
            <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled">
              {closableSlots.map((s) => {
                const key = slotKey(s.hour, s.minute);
                const label = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
                return (
                  <View key={key} style={styles.pickerRow}>
                    <Text style={styles.pickerRowLabel}>{label}</Text>
                    <Switch
                      value={keysToClose.has(key)}
                      onValueChange={(v) => toggleCloseKey(key, v)}
                      trackColor={{ false: '#ccc', true: '#A5D6A7' }}
                      thumbColor={keysToClose.has(key) ? '#4CAF50' : '#f4f3f4'}
                    />
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.pickerActions}>
              <TouchableOpacity style={styles.pickerBtnGhost} onPress={() => setClosePickerVisible(false)}>
                <Text style={styles.pickerBtnGhostText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pickerBtnPrimary} onPress={applyCloseSlots}>
                <Text style={styles.pickerBtnPrimaryText}>Применить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <NoteSheet visible={noteSheetBooking !== null} onClose={() => setNoteSheetBooking(null)} content={noteSheetBooking?.client_note} />
      <CancelReasonSheet
        visible={cancelSheetBookingId !== null}
        onClose={() => setCancelSheetBookingId(null)}
        onConfirm={(reason) => {
          if (cancelSheetBookingId) return handleCancelWithReason(cancelSheetBookingId, reason);
        }}
      />
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
    height: '85%',
    maxHeight: '85%',
  },
  safeArea: {
    flex: 1,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  timeline: {
    flex: 1,
  },
  timelineContent: {
    padding: 12,
    paddingBottom: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  freeSlotsSection: {
    padding: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    marginTop: 8,
  },
  freeSlotsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4CAF50',
    marginBottom: 2,
  },
  freeSlotsText: {
    fontSize: 12,
    color: '#4CAF50',
  },
  actions: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonTextSecondary: {
    color: '#4CAF50',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  pickerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    maxHeight: '70%',
    padding: 16,
  },
  rangeCard: {
    maxHeight: '88%',
    width: '100%',
    maxWidth: 400,
  },
  rangeSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    marginTop: 10,
    marginBottom: 4,
  },
  rangeEndHint: {
    fontSize: 11,
    color: '#888',
    marginBottom: 6,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  rangeCol: {
    flex: 1,
  },
  rangeColTitle: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  pickCol: {
    maxHeight: 160,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#fafafa',
  },
  pickColMuted: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 160,
    backgroundColor: '#f0f0f0',
  },
  pickItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  pickItemActive: {
    backgroundColor: '#E8F5E9',
  },
  pickItemText: {
    fontSize: 16,
    color: '#333',
    fontVariant: ['tabular-nums'],
  },
  pickItemTextActive: {
    color: '#4CAF50',
    fontWeight: '700',
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
    marginBottom: 6,
  },
  pickerHint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  pickerList: {
    maxHeight: 280,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  pickerRowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  pickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  pickerBtnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  pickerBtnGhostText: {
    color: '#666',
    fontSize: 15,
  },
  pickerBtnPrimary: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  pickerBtnPrimaryText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
