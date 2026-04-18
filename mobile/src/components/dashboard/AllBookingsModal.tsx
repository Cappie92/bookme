import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  FlatList,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getFutureBookingsPaged,
  getPastAppointmentsPaged,
  getMasterSettings,
  MasterSettings,
  confirmBooking,
  confirmPreVisitBooking,
  cancelBookingConfirmation,
} from '@src/services/api/master';
import { getPastStatusLabel, getPastStatusColor } from '@src/utils/bookingStatusDisplay';
import { getStatusLabel, getStatusColor } from '@src/services/api/bookings';
import {
  getBookingTab,
  canCancelBooking,
  canConfirmPostVisit,
  canPreVisitConfirmBooking,
  CANCELLATION_REASONS,
  shouldSplitFutureBookingsByConfirmation,
} from '@src/utils/bookingOutcome';
import { CancelReasonSheet } from '@src/components/bookings/CancelReasonSheet';
import { NoteSheet } from '@src/components/bookings/NoteSheet';
import { BookingCardCompact } from '@src/components/bookings/BookingCardCompact';
import { Booking } from '@src/services/api/bookings';
import {
  BookingsFiltersSheet,
  BookingsFilters,
} from '@src/components/dashboard/BookingsFiltersSheet';
import { logger } from '@src/utils/logger';

const PAGE_SIZE = 20;

type AllBookingsMode = 'future' | 'past';

function isFuturePending(status: string | undefined): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'created' || s === 'awaiting_confirmation';
}

function isFutureCancelled(status: string | undefined): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'cancelled' || s === 'cancelled_by_client_early' || s === 'cancelled_by_client_late';
}

interface AllBookingsModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmSuccess?: () => void;
  initialMode?: AllBookingsMode;
  /** Как на web: тариф с расширенной статистикой */
  hasExtendedStats?: boolean;
}

/** Нормализует элемент future/past в Booking-like для UI */
function normalizeItem(b: any, isPast: boolean): Booking & { date?: string; time?: string; cancellation_reason?: string } {
  const start = b.start_time || `${b.date || ''}T${b.time || '00:00'}:00`;
  return {
    ...b,
    id: b.id,
    start_time: start,
    end_time: b.end_time || start,
    status: b.status,
    cancellation_reason: b.cancellation_reason,
    service_name: b.service_name,
    client_display_name: b.client_display_name || b.client_name,
    client_name: b.client_name,
    client_phone: b.client_phone,
    client_master_alias: b.client_master_alias,
    client_account_name: b.client_account_name,
    has_client_note: b.has_client_note,
    client_note: b.client_note,
  } as Booking & { date?: string; time?: string; cancellation_reason?: string };
}

/** Пагинация: строка 1 — Страница + input + Применить; строка 2 — Назад/Вперёд + всего */
function PaginationControls({
  page,
  totalPages,
  total,
  onPageChange,
  loading,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
  loading: boolean;
}) {
  const [inputPage, setInputPage] = useState(String(page));

  useEffect(() => {
    setInputPage(String(page));
  }, [page]);

  const handleApply = () => {
    Keyboard.dismiss();
    const n = parseInt(inputPage, 10);
    if (Number.isFinite(n) && n >= 1 && n <= (totalPages || 1)) onPageChange(n);
  };

  const hasPrev = page > 1;
  const hasNext = page < (totalPages || 1);

  return (
    <View style={styles.paginationContainer}>
      <View style={styles.paginationRow1}>
        <Text style={styles.paginationLabel}>Страница:</Text>
        <TextInput
          style={styles.pageInput}
          value={inputPage}
          onChangeText={setInputPage}
          keyboardType="number-pad"
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.pageApplyBtn, loading && styles.btnDisabled]}
          onPress={handleApply}
          disabled={loading}
        >
          <Text style={styles.pageApplyText}>Применить</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.paginationRow2}>
        <View style={styles.paginationNavRow}>
          <TouchableOpacity
            style={[styles.pageNavBtn, (!hasPrev || loading) && styles.btnDisabled]}
            onPress={() => onPageChange(page - 1)}
            disabled={!hasPrev || loading}
          >
            <View style={styles.pageNavInner}>
              <Ionicons
                name="chevron-back"
                size={16}
                color={!hasPrev || loading ? '#ccc' : '#4CAF50'}
              />
              <Text style={[styles.pageNavText, (!hasPrev || loading) && styles.pageNavTextDisabled]}>Назад</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pageNavBtn, (!hasNext || loading) && styles.btnDisabled]}
            onPress={() => onPageChange(page + 1)}
            disabled={!hasNext || loading}
          >
            <View style={styles.pageNavInner}>
              <Text style={[styles.pageNavText, (!hasNext || loading) && styles.pageNavTextDisabled]}>Вперёд</Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={!hasNext || loading ? '#ccc' : '#4CAF50'}
              />
            </View>
          </TouchableOpacity>
        </View>
        <Text style={styles.paginationTotal}>всего: {total}</Text>
      </View>
    </View>
  );
}

export function AllBookingsModal({
  visible,
  onClose,
  onConfirmSuccess,
  initialMode = 'future',
  hasExtendedStats = false,
}: AllBookingsModalProps) {
  const insets = useSafeAreaInsets();
  const mode: AllBookingsMode = initialMode === 'past' ? 'past' : 'future';

  const [page, setPage] = useState(1);
  const [items, setItems] = useState<(Booking & { date?: string; time?: string })[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [masterSettings, setMasterSettings] = useState<MasterSettings | null>(null);
  const [filters, setFilters] = useState<BookingsFilters>({ status: '', startDate: '', endDate: '' });
  const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
  const [actionBookingId, setActionBookingId] = useState<number | null>(null);
  const [cancelSheetBookingId, setCancelSheetBookingId] = useState<number | null>(null);
  const [noteSheetBooking, setNoteSheetBooking] = useState<(Booking & { date?: string; time?: string }) | null>(null);
  const [cancellationReasonSheet, setCancellationReasonSheet] = useState<string | null>(null);
  const [briefHint, setBriefHint] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const master = masterSettings?.master ?? null;

  const loadPage = useCallback(
    async (p: number, appliedFilters?: BookingsFilters) => {
      setLoading(true);
      try {
        const pastFilters =
          mode === 'past'
            ? {
                start_date: appliedFilters?.startDate || undefined,
                end_date: appliedFilters?.endDate || undefined,
                status: appliedFilters?.status || undefined,
              }
            : undefined;
        const [settings, data] = await Promise.all([
          masterSettings ? Promise.resolve(masterSettings) : getMasterSettings(),
          mode === 'future'
            ? getFutureBookingsPaged(p, PAGE_SIZE)
            : getPastAppointmentsPaged(p, PAGE_SIZE, pastFilters),
        ]);
        if (!masterSettings) setMasterSettings(settings);

        if (mode === 'future') {
          const d = data as Awaited<ReturnType<typeof getFutureBookingsPaged>>;
          const normalized = (d.bookings || []).map((b) => normalizeItem(b, false));
          setItems(normalized);
          setTotal(d.total ?? 0);
          setTotalPages(d.total_pages ?? 0);
        } else {
          const d = data as Awaited<ReturnType<typeof getPastAppointmentsPaged>>;
          const normalized = (d.appointments || []).map((b) => normalizeItem(b, true));
          setItems(normalized);
          setTotal(d.total ?? 0);
          setTotalPages(d.pages ?? d.total_pages ?? 0);
          if (__DEV__) {
            const cancelledCount = normalized.filter((x) => /^cancelled/i.test(String(x.status || ''))).length;
            if (cancelledCount > 0) logger.debug('dashboard', '[AllBookingsModal] past page cancelled count:', cancelledCount);
          }
        }
      } catch (err) {
        logger.error('Ошибка загрузки записей:', err);
        setItems([]);
        setTotal(0);
        setTotalPages(0);
      } finally {
        setLoading(false);
      }
    },
    [mode, masterSettings]
  );

  const handleApplyFilters = useCallback(
    (applied: BookingsFilters) => {
      setFilters(applied);
      setPage(1);
      loadPage(1, applied);
    },
    [loadPage]
  );

  const handleResetFilters = useCallback(() => {
    const empty: BookingsFilters = { status: '', startDate: '', endDate: '' };
    setFilters(empty);
    setPage(1);
    loadPage(1, empty);
  }, [loadPage]);

  useEffect(() => {
    if (visible) {
      setPage(1);
      loadPage(1, mode === 'past' ? filters : undefined);
    } else {
      setItems([]);
    }
  }, [visible, mode]);

  const handlePageChange = useCallback(
    (p: number) => {
      setPage(p);
      loadPage(p, mode === 'past' ? filters : undefined);
    },
    [loadPage, mode, filters]
  );

  const splitFutureByConfirmation = shouldSplitFutureBookingsByConfirmation(master);

  const sortedItems = useMemo(() => {
    // Past: сохраняем порядок GET /past-appointments (как на web), без локальной сортировки по дате.
    if (mode === 'past') {
      return [...items];
    }
    if (!splitFutureByConfirmation) {
      return [...items].sort((a, b) => {
        const ca = isFutureCancelled(a.status) ? 1 : 0;
        const cb = isFutureCancelled(b.status) ? 1 : 0;
        if (ca !== cb) return ca - cb;
        return new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime();
      });
    }
    return [...items].sort((a, b) => {
      const groupOrder = (x: typeof a) => {
        if (isFuturePending(x.status)) return 1;
        if (isFutureCancelled(x.status)) return 3;
        return 2;
      };
      const ga = groupOrder(a);
      const gb = groupOrder(b);
      if (ga !== gb) return ga - gb;
      const ta = new Date(a.start_time || 0).getTime();
      const tb = new Date(b.start_time || 0).getTime();
      return ta - tb;
    });
  }, [items, mode, splitFutureByConfirmation]);

  const futureGroups = useMemo(() => {
    if (mode !== 'future' || !splitFutureByConfirmation) return null;
    const pending = sortedItems.filter((b) => isFuturePending(b.status));
    const confirmed = sortedItems.filter((b) => !isFuturePending(b.status) && !isFutureCancelled(b.status));
    const cancelled = sortedItems.filter((b) => isFutureCancelled(b.status));
    return { pending, confirmed, cancelled };
  }, [mode, sortedItems, splitFutureByConfirmation]);

  const handleConfirm = async (bookingId: number, booking: Booking) => {
    const isPreVisit = canPreVisitConfirmBooking(booking, master, now, hasExtendedStats);
    try {
      setActionBookingId(bookingId);
      if (isPreVisit) {
        await confirmPreVisitBooking(bookingId);
        setBriefHint('Принято');
        setTimeout(() => setBriefHint(null), 2200);
      } else {
        await confirmBooking(bookingId);
        Alert.alert('Успешно', 'Запись подтверждена');
      }
      loadPage(page);
      onConfirmSuccess?.();
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.detail || err?.message || 'Не удалось подтвердить запись');
    } finally {
      setActionBookingId(null);
    }
  };

  const handleCancelWithReason = async (bookingId: number, reason: string) => {
    try {
      setActionBookingId(bookingId);
      await cancelBookingConfirmation(bookingId, reason as any);
      loadPage(page);
      onConfirmSuccess?.();
      Alert.alert('Успешно', 'Запись отменена');
    } catch (err: any) {
      Alert.alert('Ошибка', err?.message || 'Не удалось отменить запись');
      throw err;
    } finally {
      setActionBookingId(null);
    }
  };

  const title = mode === 'future' ? 'Будущие записи' : 'Прошедшие записи';
  const sectionType = mode;

  const handleCancellationReasonPress = useCallback((booking: Booking & { cancellation_reason?: string }) => {
    const reason = booking.cancellation_reason;
    const label = (reason && CANCELLATION_REASONS[reason]) || reason || 'Причина не указана';
    setCancellationReasonSheet(label);
  }, []);

  const renderItem = ({
    item,
    section,
  }: {
    item: Booking & { date?: string; time?: string; cancellation_reason?: string };
    section?: { title: string };
  }) => {
    const hideActions = section?.title === 'Отменено';
    const isCancelled = isFutureCancelled(item.status);
    const hide = hideActions || isCancelled;
    const tab = getBookingTab(item, master, now);
    const isFuture = tab === 'future';
    const statusColor = hide
      ? '#dc2626'
      : isFuture
        ? getStatusColor(item.status as any)
        : getPastStatusColor(item.status);
    const statusLabel = hide ? 'Отменено' : isFuture ? getStatusLabel(item.status as any) : getPastStatusLabel(item.status);
    const showConfirm = !hide && (canPreVisitConfirmBooking(item, master, now, hasExtendedStats) || canConfirmPostVisit(item, master));
    const isBusy = actionBookingId === item.id;

    return (
      <View style={styles.cardWrapper}>
        <BookingCardCompact
          booking={item}
          statusLabel={statusLabel}
          statusColor={statusColor}
          showConfirm={showConfirm}
          onPressConfirm={showConfirm ? () => handleConfirm(item.id, item) : undefined}
          onPressCancel={hide ? undefined : () => setCancelSheetBookingId(item.id)}
          onNotePress={() => setNoteSheetBooking(item)}
          onCancellationReasonPress={hide ? handleCancellationReasonPress : undefined}
          showCancellationReasonIcon={hide}
          isBusy={isBusy}
        />
      </View>
    );
  };

  const futureSections: { title: string; data: (Booking & { date?: string; time?: string })[] }[] = futureGroups
    ? [
        ...(futureGroups.pending.length > 0 ? [{ title: 'На подтверждении', data: futureGroups.pending }] : []),
        ...(futureGroups.confirmed.length > 0 ? [{ title: 'Подтверждённые', data: futureGroups.confirmed }] : []),
        ...(futureGroups.cancelled.length > 0 ? [{ title: 'Отменено', data: futureGroups.cancelled }] : []),
      ]
    : [];

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={[styles.centeredView, { paddingTop: insets.top + 48, justifyContent: 'flex-start' }]}>
        <TouchableOpacity
          style={[styles.closeOverlayBtn, { top: insets.top + 4 }]}
          onPress={onClose}
          hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }}
          activeOpacity={0.7}
        >
          <Ionicons name="close" size={28} color="#333" />
        </TouchableOpacity>
        {briefHint ? (
          <View style={[styles.briefHintWrap, { bottom: insets.bottom + 16 }]} pointerEvents="none">
            <Text style={styles.briefHintText}>{briefHint}</Text>
          </View>
        ) : null}
        <View style={styles.modalView}>
          <View style={styles.headerRow}>
            <Text style={styles.modalTitle}>{title}</Text>
            {mode === 'past' && (
              <TouchableOpacity
                style={styles.filtersBtn}
                onPress={() => setFiltersSheetVisible(true)}
              >
                <Text style={styles.filtersBtnText}>Фильтры</Text>
              </TouchableOpacity>
            )}
          </View>

          <PaginationControls
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={handlePageChange}
            loading={loading}
          />

          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.loadingText}>Загрузка...</Text>
            </View>
          ) : sortedItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Нет записей</Text>
            </View>
          ) : futureSections.length > 0 ? (
            <SectionList
              sections={futureSections}
              renderItem={renderItem}
              renderSectionHeader={({ section: s }) => (
                <Text
                  style={
                    s.title === 'На подтверждении'
                      ? styles.sectionHeaderPending
                      : s.title === 'Отменено'
                        ? styles.sectionHeaderCancelled
                        : styles.sectionHeaderConfirmed
                  }
                >
                  {s.title}
                </Text>
              )}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={true}
              stickySectionHeadersEnabled={false}
            />
          ) : (
            <FlatList
              data={sortedItems}
              renderItem={({ item }) => renderItem({ item })}
              keyExtractor={(item) => item.id.toString()}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={true}
            />
          )}
        </View>
      </View>

      <NoteSheet
        visible={noteSheetBooking !== null}
        onClose={() => setNoteSheetBooking(null)}
        content={noteSheetBooking?.client_note}
      />
      <NoteSheet
        visible={cancellationReasonSheet !== null}
        onClose={() => setCancellationReasonSheet(null)}
        content={cancellationReasonSheet}
        title="Причина отмены"
        emptyText="Причина не указана"
      />
      <CancelReasonSheet
        visible={cancelSheetBookingId !== null}
        onClose={() => setCancelSheetBookingId(null)}
        onConfirm={(reason) => {
          if (cancelSheetBookingId) return handleCancelWithReason(cancelSheetBookingId, reason);
        }}
      />
      {mode === 'past' && (
        <BookingsFiltersSheet
          visible={filtersSheetVisible}
          onClose={() => setFiltersSheetVisible(false)}
          filters={filters}
          onApply={handleApplyFilters}
          onReset={handleResetFilters}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    position: 'relative',
  },
  closeOverlayBtn: {
    position: 'absolute',
    right: 12,
    zIndex: 9999,
    elevation: 9999,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 },
      android: { elevation: 8 },
    }),
  },
  modalView: {
    marginHorizontal: 12,
    marginVertical: 20,
    backgroundColor: 'white',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '95%',
    maxWidth: 400,
    maxHeight: '80%',
    alignSelf: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  filtersBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  filtersBtnText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  paginationContainer: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  paginationRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  paginationRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paginationLabel: {
    fontSize: 13,
    color: '#666',
  },
  pageInput: {
    width: 48,
    minWidth: 48,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    fontSize: 14,
    textAlign: 'center',
  },
  pageApplyBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pageApplyText: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
  },
  paginationNavRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pageNavBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  pageNavInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageNavText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  pageNavTextDisabled: {
    color: '#999',
  },
  paginationTotal: {
    fontSize: 12,
    color: '#666',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  listContainer: {
    paddingBottom: 8,
    paddingHorizontal: 0,
    flexGrow: 1,
  },
  sectionHeaderPending: {
    fontSize: 11,
    fontWeight: '600',
    color: '#b45309',
    marginTop: 8,
    marginBottom: 4,
  },
  sectionHeaderConfirmed: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    marginTop: 8,
    marginBottom: 4,
  },
  sectionHeaderCancelled: {
    fontSize: 11,
    fontWeight: '600',
    color: '#dc2626',
    marginTop: 8,
    marginBottom: 4,
  },
  cardWrapper: {
    marginBottom: 6,
  },
  centerContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  briefHintWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 10001,
  },
  briefHintText: {
    backgroundColor: 'rgba(22, 163, 74, 0.92)',
    color: '#fff',
    fontSize: 13,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
