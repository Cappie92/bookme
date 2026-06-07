import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Alert, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScrollBottomPadding } from '@src/hooks/useScrollBottomPadding';
import { HomeHeaderCard } from '@src/components/master/home/HomeHeaderCard';
import { QuickActionsGrid } from '@src/components/master/home/QuickActionsGrid';
import { TodayBookingsCard } from '@src/components/master/home/TodayBookingsCard';
import { AttentionCard } from '@src/components/master/home/AttentionCard';
import { PromotionCard } from '@src/components/master/home/PromotionCard';
import { UpcomingBookingsPreview } from '@src/components/master/home/UpcomingBookingsPreview';
import { StatsTeaserCard } from '@src/components/master/home/StatsTeaserCard';
import { useAuth } from '@src/auth/AuthContext';
import { router } from 'expo-router';
import { Card } from '@src/components/Card';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { AllBookingsModal } from '@src/components/dashboard/AllBookingsModal';
import { getUserBookings, getPastBookings, Booking, getStatusLabel, getStatusColor } from '@src/services/api/bookings';
import { getFutureBookingsPaged, getPastAppointmentsPaged } from '@src/services/api/master';
import { fetchCurrentSubscription, Subscription } from '@src/services/api/subscriptions';
import { getBalance, getBookingsLimit, getMasterSettings, getMasterServices, getWeeklySchedule, confirmBooking, confirmPreVisitBooking, cancelBookingConfirmation, getDashboardStats, Balance, BookingsLimit, MasterSettings, DashboardStats } from '@src/services/api/master';
import { refreshMasterFeaturesGlobally } from '@src/utils/masterFeaturesRefresh';
import { CancelReasonSheet } from '@src/components/bookings/CancelReasonSheet';
import { NoteSheet } from '@src/components/bookings/NoteSheet';
import { BookingCardCompact } from '@src/components/bookings/BookingCardCompact';
import { logger } from '@src/utils/logger';
import { env } from '@src/config/env';
import { isMasterAppRole, normalizeAppRole } from '@src/utils/masterRole';
import {
  MASTER_HOME_BUILD_ID,
  shouldShowMasterHomeBuildMarker,
} from '@src/constants/masterHomeBuild';

interface AttentionItem {
  id: string;
  title: string;
  route: string;
}

function isFutureCancelled(status: string | undefined): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'cancelled' || s === 'cancelled_by_client_early' || s === 'cancelled_by_client_late';
}

export default function HomeScreen() {
  const { user } = useAuth();
  const scrollViewPaddingBottom = useScrollBottomPadding(40);

  // Client никогда не попадает сюда (route groups) — редирект оставлен как fallback
  useEffect(() => {
    if (!user) return;
    const role = typeof user?.role === 'string' ? user.role.toLowerCase() : '';
    if (role === 'client') router.replace('/client/dashboard');
  }, [user]);

  // Ближайшие записи
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  /** Полный список future page 1 — для «Сегодня» и AttentionCard */
  const [allUpcomingBookings, setAllUpcomingBookings] = useState<Booking[]>([]);
  
  // Прошедшие записи
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [masterSettings, setMasterSettings] = useState<MasterSettings | null>(null);
  
  // Финансы и подписка
  const [balance, setBalance] = useState<Balance | null>(null);
  const [bookingsLimit, setBookingsLimit] = useState<BookingsLimit | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  
  // Требует внимания
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  
  // Модалка всех записей: future | past
  const [showAllBookingsModal, setShowAllBookingsModal] = useState(false);
  const [allBookingsModalMode, setAllBookingsModalMode] = useState<'future' | 'past'>('future');

  // Sheet выбора причины отмены
  const [cancelSheetBookingId, setCancelSheetBookingId] = useState<number | null>(null);
  // Sheet заметки клиента
  const [noteSheetBooking, setNoteSheetBooking] = useState<Booking | null>(null);
  
  // Статистика услуг
  const [servicesStats, setServicesStats] = useState<DashboardStats | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Короткая подсказка после pre-visit confirm (без Alert и без полного loadData) */
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);

  const userRole = normalizeAppRole(user?.role);
  const isMasterUser = isMasterAppRole(user?.role);
  const homeDiagLoggedRef = useRef(false);

  useEffect(() => {
    if (!env.DEBUG_DASHBOARD && !shouldShowMasterHomeBuildMarker()) return;
    if (homeDiagLoggedRef.current) return;
    homeDiagLoggedRef.current = true;
    console.log('[MASTER HOME V2] render', {
      buildId: MASTER_HOME_BUILD_ID,
      userId: user?.id,
      role: user?.role,
      userRole,
      isMasterUser,
      loading,
    });
  }, [user?.id, user?.role, userRole, isMasterUser, loading]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      const role = typeof user?.role === 'string' ? user.role.toLowerCase() : '';
      if (role === 'client') return; // client redirects на /client/dashboard, не грузим master-данные
      loadData();
    }, [user])
  );

  const loadData = async (opts?: { pullRefresh?: boolean }) => {
    const pull = opts?.pullRefresh === true;
    try {
      setError(null);
      if (pull) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      if (!user) {
        return;
      }

      const loadRole = normalizeAppRole(user?.role);
      const isMaster = isMasterAppRole(user?.role);

      if (isMaster) {
        let settings: MasterSettings | null = null;
        try {
          settings = await getMasterSettings();
        } catch (err) {
          logger.error('Failed to load master settings', err);
        }
        await Promise.all([
          loadUpcomingBookings(loadRole),
          loadPastBookings(loadRole, settings),
          loadFinanceData(),
          loadAttentionItems(settings),
          loadServicesStats(),
        ]);
        refreshMasterFeaturesGlobally(user?.id).catch(() => {});
      } else {
        await loadUpcomingBookings(loadRole);
        await loadPastBookings(loadRole);
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных');
      logger.error('Error loading dashboard data:', err);
    } finally {
      if (pull) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const loadUpcomingBookings = async (userRole: string) => {
    try {
      const isMaster = userRole === 'master' || userRole === 'indie';
      if (isMaster) {
        const { bookings } = await getFutureBookingsPaged(1, 20);
        const normalized = bookings.map(b => ({
          ...b,
          start_time: b.start_time || `${b.date || ''}T${b.time || '00:00'}:00`,
          end_time: b.end_time || '',
        })) as Booking[];
        // Дашборд: ровно 3, только awaiting_confirmation/confirmed/created, без cancelled
        // Сортировка СТРОГО по start_time ASC, без группировки по статусу
        const allNonCancelled = normalized
          .filter((b) => !isFutureCancelled(b.status))
          .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        setAllUpcomingBookings(allNonCancelled);

        const eligible = allNonCancelled.filter((b) => {
          const s = String(b.status || '').toLowerCase();
          return s === 'awaiting_confirmation' || s === 'confirmed' || s === 'created';
        });
        const dashboardList = eligible.slice(0, 3);
        if (dashboardList.length > 0) {
          const times = dashboardList.map((x) => ({ id: x.id, status: x.status, start_time: x.start_time }));
          const mono = dashboardList.every(
            (x, i) => i === 0 || new Date(x.start_time).getTime() >= new Date(dashboardList[i - 1].start_time).getTime()
          );
          logger.debug('dashboard', '[index] Dashboard future (3):', times, 'monotonic:', mono);
        }
        setUpcomingBookings(dashboardList);
      } else {
        const bookings = await getUserBookings(undefined, userRole);
        const now = new Date();
        const future = bookings
          .filter(b => new Date(b.start_time) > now)
          .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
          .slice(0, 3);
        setUpcomingBookings(future);
      }
    } catch (err) {
      logger.warn('Не удалось загрузить будущие записи:', err);
      setUpcomingBookings([]);
      setAllUpcomingBookings([]);
    }
  };

  const loadPastBookings = async (userRole: string, settings?: MasterSettings | null) => {
    try {
      const isMaster = userRole === 'master' || userRole === 'indie';
      if (isMaster && settings !== undefined) {
        const pastRes = await getPastAppointmentsPaged(1, 3);
        const normalized = (pastRes.appointments || []).map(b => ({
          ...b,
          start_time: b.start_time || `${b.date || ''}T${b.time || '00:00'}:00`,
          end_time: b.end_time || '',
        })) as Booking[];
        setPastBookings(normalized);
        setMasterSettings(settings);
      } else {
        const past = await getPastBookings(userRole);
        setPastBookings(past.slice(0, 3));
        setMasterSettings(null);
      }
    } catch (err) {
      logger.warn('Не удалось загрузить прошедшие записи:', err);
      setPastBookings([]);
      setMasterSettings(null);
    }
  };

  const loadFinanceData = async () => {
    try {
      const [balanceData, limitData, subscriptionData] = await Promise.all([
        getBalance().catch(() => null),
        getBookingsLimit().catch(() => null),
        fetchCurrentSubscription().catch(() => null),
      ]);
      if (balanceData) setBalance(balanceData);
      if (limitData) setBookingsLimit(limitData);
      if (subscriptionData) setSubscription(subscriptionData);
    } catch (err) {
      logger.warn('Не удалось загрузить финансовые данные:', err);
    }
  };

  const loadAttentionItems = async (settings: MasterSettings | null) => {
    try {
      const [services, schedule] = await Promise.all([
        getMasterServices().catch(() => []),
        getWeeklySchedule(0, 4).catch(() => null),
      ]);

      const items: AttentionItem[] = [];

      if (settings) {
        // 1. Проверка ФИО
        if (!settings.user.full_name || settings.user.full_name.trim() === '') {
          items.push({
            id: 'full_name',
            title: 'Не указано ФИО',
            route: '/master/settings',
          });
        }

        // 2. Проверка email
        if (!settings.user.email || settings.user.email.trim() === '') {
          items.push({
            id: 'email',
            title: 'Не указан email',
            route: '/master/settings',
          });
        }

        // 3. Проверка фото
        if (!settings.master.photo || settings.master.photo.trim() === '') {
          items.push({
            id: 'photo',
            title: 'Не загружено фото профиля',
            route: '/master/settings',
          });
        }

        // 4. Проверка описания
        if (!settings.master.bio || settings.master.bio.trim() === '') {
          items.push({
            id: 'bio',
            title: 'Не заполнено описание профиля',
            route: '/master/settings',
          });
        }

        // 5. Проверка города
        if (!settings.master.city || settings.master.city.trim() === '') {
          items.push({
            id: 'city',
            title: 'Не указан город',
            route: '/master/settings',
          });
        }

        // 6. Проверка адреса
        if (!settings.master.address || settings.master.address.trim() === '') {
          items.push({
            id: 'address',
            title: 'Не указан адрес',
            route: '/master/settings',
          });
        }
      }

      // 7. Проверка услуг
      if (services.length === 0) {
        items.push({
          id: 'services',
          title: 'Добавьте услуги',
          route: '/master/services',
        });
      }

      // 8. Проверка расписания (доступные слоты)
      if (schedule) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const availableSlots = schedule.slots?.filter(slot => {
          const slotDate = new Date(slot.schedule_date);
          slotDate.setHours(0, 0, 0, 0);
          
          return slot.is_working && 
                 !slot.has_conflict &&
                 slotDate >= today;
        }) || [];
        
        if (availableSlots.length === 0) {
          items.push({
            id: 'schedule',
            title: 'Нет доступных слотов для записи',
            route: '/master/schedule',
          });
        }
      }

      setAttentionItems(items);
    } catch (err) {
      logger.warn('Не удалось загрузить данные для проверки:', err);
      setAttentionItems([]);
    }
  };

  const loadServicesStats = async () => {
    try {
      const stats = await getDashboardStats('week', 0);
      setServicesStats(stats);
    } catch (err) {
      logger.warn('Не удалось загрузить статистику услуг:', err);
      setServicesStats(null);
    }
  };

  /** Обновление списков/графиков без полного экрана «Загрузка…» и без лишних блоков */
  const refreshMasterListsAndCharts = async () => {
    if (!user) return;
    const refreshRole = normalizeAppRole(user?.role);
    if (!isMasterAppRole(user?.role)) return;
    try {
      const settings = await getMasterSettings();
      setMasterSettings(settings);
      await Promise.all([
        loadUpcomingBookings(refreshRole),
        loadPastBookings(refreshRole, settings),
        loadServicesStats(),
      ]);
      const limit = await getBookingsLimit().catch(() => null);
      if (limit) setBookingsLimit(limit);
    } catch (e) {
      logger.warn('refreshMasterListsAndCharts', e);
    }
  };

  const handleConfirmPreVisit = async (bookingId: number) => {
    try {
      await confirmPreVisitBooking(bookingId);
      await refreshMasterListsAndCharts();
      setInlineSuccess('Принято');
      setTimeout(() => setInlineSuccess(null), 2200);
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.detail || err?.message || 'Не удалось принять запись');
    }
  };

  const handleConfirmPostVisit = async (bookingId: number) => {
    try {
      await confirmBooking(bookingId);
      await loadData();
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.detail || err?.message || 'Не удалось подтвердить запись');
    }
  };

  const handleCancelWithReason = async (bookingId: number, reason: string) => {
    try {
      await cancelBookingConfirmation(bookingId, reason as any);
      await loadData();
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.detail || err?.message || 'Не удалось отменить запись');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeAreaContainer} edges={['top', 'left', 'right']}>
        <StatusBar style="auto" />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeAreaContainer} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      {inlineSuccess ? (
        <View style={[styles.inlineToast, { bottom: scrollViewPaddingBottom + 8 }]} pointerEvents="none">
          <Text style={styles.inlineToastText}>{inlineSuccess}</Text>
        </View>
      ) : null}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: scrollViewPaddingBottom }
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData({ pullRefresh: true })} />
        }
      >
        {shouldShowMasterHomeBuildMarker() ? (
          <Text testID="master-home-v2-marker" style={styles.homeBuildMarker}>
            MASTER_HOME_V2 {MASTER_HOME_BUILD_ID}
            {isMasterUser ? '' : ` · role=${userRole || '?'}`}
          </Text>
        ) : null}

        {isMasterUser ? (
          <>
            <HomeHeaderCard
              userName={user?.full_name?.trim() || 'мастер'}
              subscription={subscription}
              onSubscriptionPress={() => router.push('/subscriptions')}
            />
            <QuickActionsGrid />
            <TodayBookingsCard bookings={allUpcomingBookings} />
            <AttentionCard
              futureBookings={allUpcomingBookings}
              pastBookings={pastBookings}
              master={masterSettings?.master ?? null}
              setupSources={attentionItems}
              hasExtendedStats={subscription?.features?.has_extended_stats === true}
              onConfirmPreVisit={handleConfirmPreVisit}
              onConfirmPostVisit={handleConfirmPostVisit}
            />
            <PromotionCard masterSettings={masterSettings} />
            <UpcomingBookingsPreview bookings={allUpcomingBookings} />
            <StatsTeaserCard
              stats={servicesStats}
              hasExtendedStats={subscription?.features?.has_extended_stats === true}
            />
          </>
        ) : (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Будущие записи</Text>
            {upcomingBookings.length === 0 ? (
              <Text style={styles.emptyText}>Нет предстоящих записей</Text>
            ) : (
              <View style={styles.bookingsList}>
                {upcomingBookings.map((booking) => (
                  <BookingCardCompact
                    key={booking.id}
                    booking={booking}
                    statusLabel={getStatusLabel(booking.status)}
                    statusColor={getStatusColor(booking.status)}
                    onPressCancel={() => setCancelSheetBookingId(booking.id)}
                    onNotePress={(b) => setNoteSheetBooking(b)}
                  />
                ))}
              </View>
            )}
            <SecondaryButton
              title="Все записи"
              onPress={() => { setAllBookingsModalMode('future'); setShowAllBookingsModal(true); }}
              style={styles.secondaryButton}
            />
          </Card>
        )}
      </ScrollView>

      {/* Модальное окно "Все записи" — только для master, чтобы client никогда не монтировал и не дергал getMasterSettings */}
      {isMasterUser && (
        <AllBookingsModal
          visible={showAllBookingsModal}
          onClose={() => setShowAllBookingsModal(false)}
          onConfirmSuccess={() => refreshMasterListsAndCharts()}
          initialMode={allBookingsModalMode}
          hasExtendedStats={subscription?.features?.has_extended_stats === true}
        />
      )}

      {/* Sheet заметки клиента */}
      <NoteSheet
        visible={noteSheetBooking !== null}
        onClose={() => setNoteSheetBooking(null)}
        content={noteSheetBooking?.client_note}
      />

      {/* Sheet выбора причины отмены */}
      <CancelReasonSheet
        visible={cancelSheetBookingId !== null}
        onClose={() => setCancelSheetBookingId(null)}
        onConfirm={async (reason) => {
          if (!cancelSheetBookingId) return;
          try {
            await cancelBookingConfirmation(cancelSheetBookingId, reason as any);
            await loadData();
            Alert.alert('Успешно', 'Запись отменена');
          } catch (err: any) {
            Alert.alert('Ошибка', err?.response?.data?.detail || err?.message || 'Не удалось отменить запись');
            throw err;
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 16, // Небольшой отступ сверху для контента (SafeAreaView уже дал отступ для status bar)
  },
  homeBuildMarker: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  card: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  bookingsList: {
    marginBottom: 16,
  },
  bookingGroup: {
    marginBottom: 12,
  },
  groupLabelPending: {
    fontSize: 11,
    fontWeight: '600',
    color: '#b45309',
    marginBottom: 4,
  },
  groupLabelConfirmed: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  groupLabelCancelled: {
    fontSize: 11,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 4,
  },
  bookingItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bookingTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  bookingService: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bookingClient: {
    fontSize: 12,
    color: '#666',
  },
  pastBookingItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pastBookingHeader: {
    marginBottom: 12,
  },
  pastBookingDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  confirmationButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonSuccess: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  confirmButtonDanger: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#F44336',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  confirmButtonTextWhite: {
    color: '#F44336',
  },
  financeContent: {
    marginBottom: 16,
  },
  financeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  financeLabel: {
    fontSize: 14,
    color: '#666',
  },
  financeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  financeValueZero: {
    color: '#E65100',
  },
  daysRemainingCol: {
    alignItems: 'flex-end',
  },
  zeroDaysHint: {
    fontSize: 12,
    color: '#E65100',
    marginTop: 4,
    maxWidth: 200,
    textAlign: 'right',
  },
  subscriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subscriptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  attentionList: {
    marginBottom: 16,
  },
  attentionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  attentionText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  attentionChevron: {
    marginLeft: 8,
  },
  expandButton: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  expandButtonText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 8,
  },
  servicesStatsHeader: {
    marginBottom: 16,
  },
  segmentedControlContainer: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 4,
    marginTop: 12,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  segmentButtonTextActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  servicesList: {
    marginTop: 8,
  },
  serviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 8,
  },
  serviceItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  serviceRank: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginRight: 12,
    minWidth: 30,
  },
  serviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  serviceValue: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  inlineToast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 50,
    alignItems: 'center',
  },
  inlineToastText: {
    backgroundColor: 'rgba(22, 163, 74, 0.92)',
    color: '#fff',
    fontSize: 13,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
