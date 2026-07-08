/**
 * DatePicker — компактный календарь по месяцам; доступны только даты из availability.
 * Список DateOption по-прежнему строится снаружи (buildDateOptionsFromSlots).
 */
import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDateForPicker } from '@src/utils/format';
import { publicBookingSheetBottomPadding } from './publicBookingSafeArea';

export interface DateOption {
  dateStr: string; // YYYY-MM-DD
  displayLabel: string; // "Сегодня", "Завтра", "28.02, Пн"
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toDateStr(y: number, monthIndex: number, day: number): string {
  return `${y}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

function monthKey(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}

function startOfMonth(y: number, m0: number): Date {
  return new Date(y, m0, 1);
}

function monthTitleRu(d: Date): string {
  const t = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(d);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

interface DatePickerProps {
  visible: boolean;
  onClose: () => void;
  dates: DateOption[];
  selectedDate: string | null;
  onSelect: (dateStr: string) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** iOS / Android оформление bottom sheet */
  nativeVariant?: 'ios' | 'android';
}

export function DatePicker({
  visible,
  onClose,
  dates,
  selectedDate,
  onSelect,
  loading,
  error,
  onRetry,
  nativeVariant = 'android',
}: DatePickerProps) {
  const insets = useSafeAreaInsets();
  const sheetBottomPadding = publicBookingSheetBottomPadding(insets);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date().getFullYear(), new Date().getMonth()));

  const availableSet = useMemo(() => new Set(dates.map((d) => d.dateStr)), [dates]);

  const datesKey = useMemo(() => [...dates].map((d) => d.dateStr).sort().join(','), [dates]);

  const labelByStr = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of dates) {
      m.set(d.dateStr, d.displayLabel);
    }
    return m;
  }, [dates]);

  const { minMonthKey, maxMonthKey } = useMemo(() => {
    if (dates.length === 0) return { minMonthKey: 0, maxMonthKey: 0 };
    const sorted = [...dates].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    const minD = parseDateStr(sorted[0].dateStr);
    const maxD = parseDateStr(sorted[sorted.length - 1].dateStr);
    return { minMonthKey: monthKey(minD), maxMonthKey: monthKey(maxD) };
  }, [dates]);

  useEffect(() => {
    if (!visible) return;
    if (selectedDate && availableSet.has(selectedDate)) {
      const d = parseDateStr(selectedDate);
      setViewMonth(startOfMonth(d.getFullYear(), d.getMonth()));
      return;
    }
    if (dates.length > 0) {
      const sorted = [...dates].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
      const d = parseDateStr(sorted[0].dateStr);
      setViewMonth(startOfMonth(d.getFullYear(), d.getMonth()));
    } else {
      const n = new Date();
      setViewMonth(startOfMonth(n.getFullYear(), n.getMonth()));
    }
  }, [visible, selectedDate, datesKey, availableSet, dates.length]);

  const handleSelect = (dateStr: string) => {
    onSelect(dateStr);
    onClose();
  };

  const y = viewMonth.getFullYear();
  const m0 = viewMonth.getMonth();
  const dim = new Date(y, m0 + 1, 0).getDate();
  const firstJsDay = new Date(y, m0, 1).getDay();
  const leading = (firstJsDay + 6) % 7;

  const cells: ({ type: 'blank' } | { type: 'day'; day: number })[] = [];
  for (let i = 0; i < leading; i++) cells.push({ type: 'blank' });
  for (let day = 1; day <= dim; day++) cells.push({ type: 'day', day });
  const tail = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < tail; i++) cells.push({ type: 'blank' });

  const curKey = monthKey(viewMonth);
  const canPrev = dates.length > 0 && curKey > minMonthKey;
  const canNext = dates.length > 0 && curKey < maxMonthKey;

  const goPrev = () => {
    if (!canPrev) return;
    setViewMonth(new Date(y, m0 - 1, 1));
  };
  const goNext = () => {
    if (!canNext) return;
    setViewMonth(new Date(y, m0 + 1, 1));
  };

  const selectedHint =
    selectedDate && labelByStr.get(selectedDate)
      ? labelByStr.get(selectedDate)
      : selectedDate
        ? formatDateForPicker(selectedDate)
        : null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            nativeVariant === 'ios' ? styles.sheetIos : styles.sheetAndroid,
            { paddingBottom: sheetBottomPadding },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {nativeVariant === 'ios' ? <View style={styles.sheetGrab} /> : null}
          <View style={styles.header}>
            <Text style={styles.title}>Выберите дату</Text>
            {nativeVariant === 'ios' ? (
              <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button">
                <Text style={styles.doneBtn}>Готово</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button">
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.loadingText}>Загрузка доступных дат...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
              {onRetry && (
                <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
                  <Text style={styles.retryBtnText}>Повторить</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : dates.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>Нет доступных дат на ближайшие 14 дней</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.monthRow}>
                <TouchableOpacity
                  onPress={goPrev}
                  disabled={!canPrev}
                  style={[styles.monthNavBtn, !canPrev && styles.monthNavBtnDisabled]}
                  hitSlop={8}
                >
                  <Ionicons name="chevron-back" size={22} color={canPrev ? '#333' : '#ccc'} />
                </TouchableOpacity>
                <Text style={styles.monthTitle} numberOfLines={1}>
                  {monthTitleRu(viewMonth)}
                </Text>
                <TouchableOpacity
                  onPress={goNext}
                  disabled={!canNext}
                  style={[styles.monthNavBtn, !canNext && styles.monthNavBtnDisabled]}
                  hitSlop={8}
                >
                  <Ionicons name="chevron-forward" size={22} color={canNext ? '#333' : '#ccc'} />
                </TouchableOpacity>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAYS.map((w) => (
                  <Text key={w} style={styles.weekday}>
                    {w}
                  </Text>
                ))}
              </View>

              <View style={styles.grid}>
                {cells.map((c, idx) => {
                  if (c.type === 'blank') {
                    return <View key={`b-${idx}`} style={styles.dayCell} />;
                  }
                  const dateStr = toDateStr(y, m0, c.day);
                  const has = availableSet.has(dateStr);
                  const sel = selectedDate === dateStr;
                  return (
                    <TouchableOpacity
                      key={dateStr}
                      style={[
                        styles.dayCell,
                        styles.dayTouchable,
                        !has && styles.dayDisabled,
                        sel && styles.daySelected,
                      ]}
                      disabled={!has}
                      onPress={() => handleSelect(dateStr)}
                      activeOpacity={has ? 0.7 : 1}
                      accessibilityState={{ disabled: !has, selected: sel }}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          !has && styles.dayNumDisabled,
                          sel && styles.dayNumSelected,
                        ]}
                      >
                        {c.day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selectedHint ? (
                <Text style={styles.hint} numberOfLines={2}>
                  Выбрано: {selectedHint}
                </Text>
              ) : (
                <Text style={styles.hintMuted}>Выберите доступный день — окно закроется автоматически</Text>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function buildDateOptionsFromSlots(
  slots: { start_time: string }[],
  masterTimezone?: string
): DateOption[] {
  const seen = new Set<string>();
  const result: DateOption[] = [];
  for (const s of slots) {
    const dateStr = s.start_time.slice(0, 10);
    if (seen.has(dateStr)) continue;
    seen.add(dateStr);
    result.push({
      dateStr,
      displayLabel: formatDateForPicker(dateStr),
    });
  }
  result.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  return result;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '78%',
  },
  sheetIos: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetAndroid: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetGrab: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d9dfd9',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  doneBtn: {
    fontSize: 16,
    fontWeight: '700',
    color: '#50b95a',
  },
  loadingWrap: {
    padding: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  errorWrap: {
    padding: 24,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#c00',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyWrap: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
  },
  scroll: {
    maxHeight: 480,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 12,
  },
  monthNavBtn: {
    padding: 8,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavBtnDisabled: {
    opacity: 0.4,
  },
  monthTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: '#222',
    textTransform: 'capitalize',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    paddingVertical: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  dayCell: {
    width: '14.2857%',
    minHeight: 44,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayTouchable: {
    borderRadius: 10,
  },
  dayDisabled: {
    opacity: 0.28,
  },
  daySelected: {
    backgroundColor: '#e8f5e9',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  dayNum: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  dayNumDisabled: {
    color: '#999',
  },
  dayNumSelected: {
    color: '#2e7d32',
  },
  hint: {
    marginTop: 14,
    fontSize: 14,
    color: '#2e7d32',
    fontWeight: '500',
    textAlign: 'center',
  },
  hintMuted: {
    marginTop: 14,
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
  },
});
