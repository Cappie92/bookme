import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarHeight } from '@src/contexts/TabBarHeightContext';
import { BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT } from '@src/constants/bottomNavLayout';
import { useAuth } from '@src/auth/AuthContext';
import { router } from 'expo-router';
import { Card } from '@src/components/Card';
import { SecondaryButton } from '@src/components/SecondaryButton';
import { StatusBadge } from '@src/components/StatusBadge';
import { AllBookingsModal } from '@src/components/dashboard/AllBookingsModal';
import { WeeklyStatsCharts } from '@src/components/dashboard/WeeklyStatsCharts';
import { getUserBookings, getPastBookings, Booking, getStatusLabel, getStatusColor } from '@src/services/api/bookings';
import { getFutureBookingsPaged, getPastAppointmentsPaged } from '@src/services/api/master';
import { getPastStatusLabel, getPastStatusColor } from '@src/utils/bookingStatusDisplay';
import { fetchCurrentSubscription, Subscription, getStatusLabel as getSubscriptionStatusLabel, getStatusColor as getSubscriptionStatusColor, getDaysRemaining } from '@src/services/api/subscriptions';
import { getBalance, getBookingsLimit, getMasterSettings, getMasterServices, getWeeklySchedule, confirmBooking, confirmPreVisitBooking, cancelBookingConfirmation, getDashboardStats, Balance, BookingsLimit, MasterSettings, ScheduleWeek, DashboardStats } from '@src/services/api/master';
import { useMasterFeatures } from '@src/hooks/useMasterFeatures';
import { formatMoney } from '@src/utils/money';
import { canPreVisitConfirmBooking, canConfirmPostVisit, canCancelBooking, debugConfirmUI } from '@src/utils/bookingOutcome';
import { CancelReasonSheet } from '@src/components/bookings/CancelReasonSheet';
import { NoteSheet } from '@src/components/bookings/NoteSheet';
import { BookingCardCompact } from '@src/components/bookings/BookingCardCompact';
import { stripIndiePrefix } from '@src/utils/stripIndiePrefix';
import { getPlanTitle } from '@src/utils/planTitle';
import { logger } from '@src/utils/logger';
import { Ionicons } from '@expo/vector-icons';

interface AttentionItem {
  id: string;
  title: string;
  route: string;
}

function isFuturePending(status: string | undefined): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'created' || s === 'awaiting_confirmation';
}

function isFutureCancelled(status: string | undefined): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'cancelled' || s === 'cancelled_by_client_early' || s === 'cancelled_by_client_late';
}

export default function HomeScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { tabBarHeight } = useTabBarHeight();
  const { features } = useMasterFeatures();

  // Client никогда не попадает сюда (route groups) — редирект оставлен как fallback
  useEffect(() => {
    if (!user) return;
    const role = typeof user?.role === 'string' ? user.role.toLowerCase() : '';
    if (role === 'client') router.replace('/client/dashboard');
  }, [user]);

  // Ближайшие записи
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  
  // Прошедшие записи
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [masterSettings, setMasterSettings] = useState<MasterSettings | null>(null);
  
  // Финансы и подписка
  const [balance, setBalance] = useState<Balance | null>(null);
  const [bookingsLimit, setBookingsLimit] = useState<BookingsLimit | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  
  // Требует внимания
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [attentionExpanded, setAttentionExpanded] = useState(false);
  
  // Модалка всех записей: future | past
  const [showAllBookingsModal, setShowAllBookingsModal] = useState(false);
  const [allBookingsModalMode, setAllBookingsModalMode] = useState<'future' | 'past'>('future');

  // Sheet выбора причины отмены
  const [cancelSheetBookingId, setCancelSheetBookingId] = useState<number | null>(null);
  // Sheet заметки клиента
  const [noteSheetBooking, setNoteSheetBooking] = useState<Booking | null>(null);
  
  // Статистика услуг
  const [servicesStats, setServicesStats] = useState<DashboardStats | null>(null);
  const [servicesStatsTab, setServicesStatsTab] = useState<'bookings' | 'earnings'>('bookings');
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Короткая подсказка после pre-visit confirm (без Alert и без полного loadData) */
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);

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

      const userRole = typeof user?.role === 'string' ? user.role.toLowerCase() : String(user?.role || '').toLowerCase();
      const isMaster = userRole === 'master' || userRole === 'indie';

      if (isMaster) {
        let settings: MasterSettings | null = null;
        try {
          settings = await getMasterSettings();
        } catch (err) {
          logger.error('Failed to load master settings', err);
        }
        await Promise.all([
          loadUpcomingBookings(userRole),
          loadPastBookings(userRole, settings),
          loadFinanceData(),
          loadAttentionItems(settings),
          loadServicesStats(),
        ]);
      } else {
        await loadUpcomingBookings(userRole);
        await loadPastBookings(userRole);
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
        const eligible = normalized
          .filter((b) => !isFutureCancelled(b.status))
          .filter((b) => {
            const s = String(b.status || '').toLowerCase();
            return s === 'awaiting_confirmation' || s === 'confirmed' || s === 'created';
          });
        const dashboardList = eligible
          .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
          .slice(0, 3);
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
    const userRole = typeof user?.role === 'string' ? user.role.toLowerCase() : String(user?.role || '').toLowerCase();
    if (userRole !== 'master' && userRole !== 'indie') return;
    try {
      const settings = await getMasterSettings();
      setMasterSettings(settings);
      await Promise.all([
        loadUpcomingBookings(userRole),
        loadPastBookings(userRole, settings),
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

  // Вычисляем значения для safe-area (до раннего return)
  const measuredTabBarHeight = tabBarHeight ?? BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT;
  const BOTTOM_PADDING = 16;
  const scrollViewPaddingBottom = insets.bottom + measuredTabBarHeight + BOTTOM_PADDING;

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

  const userRole = typeof user?.role === 'string' ? user.role.toLowerCase() : String(user?.role || '').toLowerCase();
  const isMaster = userRole === 'master' || userRole === 'indie';

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
        {/* Карточка "Будущие записи" */}
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Будущие записи</Text>
          {upcomingBookings.length === 0 ? (
            <Text style={styles.emptyText}>Нет предстоящих записей</Text>
          ) : (
            <View style={styles.bookingsList}>
              {upcomingBookings.map((booking) => {
                const master = masterSettings?.master ?? null;
                const showPreVisit = canPreVisitConfirmBooking(booking, master, new Date(), features?.has_extended_stats === true);
                debugConfirmUI(booking, master, 'Dashboard Ближайшие');
                return (
                  <BookingCardCompact
                    key={booking.id}
                    booking={booking}
                    statusLabel={getStatusLabel(booking.status)}
                    statusColor={getStatusColor(booking.status)}
                    showConfirm={showPreVisit}
                    onPressConfirm={showPreVisit ? () => handleConfirmPreVisit(booking.id) : undefined}
                    onPressCancel={() => setCancelSheetBookingId(booking.id)}
                    onNotePress={(b) => setNoteSheetBooking(b)}
                  />
                );
              })}
            </View>
          )}
          <SecondaryButton
            title="Все записи"
            onPress={() => { setAllBookingsModalMode('future'); setShowAllBookingsModal(true); }}
            style={styles.secondaryButton}
          />
        </Card>

        {/* Карточка "Прошедшие записи" - только для мастеров, всегда показывать */}
        {isMaster && (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Прошедшие записи</Text>
            {pastBookings.length === 0 ? (
              <Text style={styles.emptyText}>Нет прошедших записей</Text>
            ) : (
              <View style={styles.bookingsList}>
                {pastBookings.map((booking) => {
                  const master = masterSettings?.master ?? null;
                  const showPostVisit = canConfirmPostVisit(booking, master);
                  debugConfirmUI(booking, master, 'Dashboard Прошедшие');
                return (
                  <BookingCardCompact
                    key={booking.id}
                    booking={booking}
                    statusLabel={getPastStatusLabel(booking.status)}
                    statusColor={getPastStatusColor(booking.status)}
                    showConfirm={showPostVisit}
                    onPressConfirm={() => handleConfirmPostVisit(booking.id)}
                    onPressCancel={() => setCancelSheetBookingId(booking.id)}
                    onNotePress={(b) => setNoteSheetBooking(b)}
                  />
                );
                })}
              </View>
            )}
            <SecondaryButton
              title="Все записи"
              onPress={() => { setAllBookingsModalMode('past'); setShowAllBookingsModal(true); }}
              style={styles.secondaryButton}
            />
          </Card>
        )}

        {/* Карточка "Подписка" - только для мастеров */}
        {isMaster && (balance || subscription || bookingsLimit) && (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Подписка</Text>
            <View style={styles.financeContent}>
              {balance && (
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Баланс</Text>
                  <Text style={styles.financeValue}>{formatMoney(balance.available_balance ?? 0)}</Text>
                </View>
              )}
              {subscription?.end_date != null && (
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Дней осталось</Text>
                  <View style={styles.daysRemainingCol}>
                    <Text
                      style={[
                        styles.financeValue,
                        (subscription.days_remaining ?? getDaysRemaining(subscription.end_date)) === 0 &&
                        (subscription.daily_rate ?? 0) > 0 &&
                        (subscription.plan_name ?? '').toLowerCase() !== 'free'
                          ? styles.financeValueZero
                          : null,
                      ]}
                    >
                      {subscription.days_remaining != null
                        ? subscription.days_remaining
                        : getDaysRemaining(subscription.end_date)}
                    </Text>
                    {(subscription.days_remaining ?? getDaysRemaining(subscription.end_date)) === 0 &&
                    (subscription.daily_rate ?? 0) > 0 &&
                    (subscription.plan_name ?? '').toLowerCase() !== 'free' && (
                      <Text style={styles.zeroDaysHint}>
                        Пополните баланс, чтобы подписка не отключилась
                      </Text>
                    )}
                  </View>
                </View>
              )}
              {subscription && (
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Подписка</Text>
                  <View style={styles.subscriptionRow}>
                    <Text style={styles.subscriptionName}>
                      {getPlanTitle({
                        plan_display_name: subscription?.plan_display_name,
                        plan_name: subscription?.plan_name ?? features?.plan_name ?? undefined,
                      }) || 'Базовый план'}
                    </Text>
                    <StatusBadge
                      label={getSubscriptionStatusLabel(subscription.status)}
                      color={getSubscriptionStatusColor(subscription.status)}
                    />
                  </View>
                </View>
              )}
              {bookingsLimit && !bookingsLimit.is_unlimited && bookingsLimit.plan_name === 'Free' && (
                <View style={styles.financeRow}>
                  <Text style={styles.financeLabel}>Активные записи</Text>
                  <Text style={styles.financeValue}>
                    {bookingsLimit.current_bookings} / {bookingsLimit.limit}
                  </Text>
                </View>
              )}
            </View>
            <SecondaryButton
              title="Управление подпиской"
              onPress={() => router.push('/subscriptions')}
              style={styles.secondaryButton}
            />
          </Card>
        )}

        {/* Карточка "Требует внимания" - только для мастеров */}
        {isMaster && (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Требует внимания</Text>
            {attentionItems.length === 0 ? (
              <Text style={styles.emptyText}>Все в порядке</Text>
            ) : (
              <>
                <View style={styles.attentionList}>
                  {attentionItems.slice(0, 3).map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.attentionItem}
                      onPress={() => router.push(item.route as any)}
                    >
                      <Text style={styles.attentionText}>{item.title}</Text>
                      <Ionicons name="chevron-forward" size={18} color="#999" style={styles.attentionChevron} />
                    </TouchableOpacity>
                  ))}
                </View>
                {attentionItems.length > 3 && (
                  <TouchableOpacity
                    style={styles.expandButton}
                    onPress={() => setAttentionExpanded(!attentionExpanded)}
                  >
                    <Text style={styles.expandButtonText}>
                      {attentionExpanded ? 'Скрыть' : `Ещё ${attentionItems.length - 3}`}
                    </Text>
                  </TouchableOpacity>
                )}
                {attentionExpanded && attentionItems.length > 3 && (
                  <View style={styles.attentionList}>
                    {attentionItems.slice(3).map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.attentionItem}
                        onPress={() => router.push(item.route as any)}
                      >
                        <Text style={styles.attentionText}>{item.title}</Text>
                        <Ionicons name="chevron-forward" size={18} color="#999" style={styles.attentionChevron} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </Card>
        )}

        {/* Карточка "Статистика услуг" - только для мастеров */}
        {isMaster && servicesStats && (
          <Card style={styles.card}>
            <View style={styles.servicesStatsHeader}>
              <Text style={styles.cardTitle}>Статистика услуг</Text>
              <View style={styles.segmentedControlContainer}>
                <TouchableOpacity
                  style={[styles.segmentButton, servicesStatsTab === 'bookings' && styles.segmentButtonActive]}
                  onPress={() => setServicesStatsTab('bookings')}
                >
                  <Text style={[styles.segmentButtonText, servicesStatsTab === 'bookings' && styles.segmentButtonTextActive]}>
                    По записям
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segmentButton, servicesStatsTab === 'earnings' && styles.segmentButtonActive]}
                  onPress={() => setServicesStatsTab('earnings')}
                >
                  <Text style={[styles.segmentButtonText, servicesStatsTab === 'earnings' && styles.segmentButtonTextActive]}>
                    По доходу
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            {servicesStatsTab === 'bookings' ? (
              servicesStats.top_services_by_bookings && servicesStats.top_services_by_bookings.length > 0 ? (
                <View style={styles.servicesList}>
                  {servicesStats.top_services_by_bookings.slice(0, 5).map((service, index) => (
                    <View key={service.service_id} style={styles.serviceItem}>
                      <View style={styles.serviceItemLeft}>
                        <Text style={styles.serviceRank}>#{index + 1}</Text>
                        <Text style={styles.serviceName}>{stripIndiePrefix(service.service_name)}</Text>
                      </View>
                      <Text style={styles.serviceValue}>{service.booking_count} записей</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Нет данных за период</Text>
              )
            ) : (
              servicesStats.top_services_by_earnings && servicesStats.top_services_by_earnings.length > 0 ? (
                <View style={styles.servicesList}>
                  {servicesStats.top_services_by_earnings.slice(0, 5).map((service, index) => (
                    <View key={service.service_id} style={styles.serviceItem}>
                      <View style={styles.serviceItemLeft}>
                        <Text style={styles.serviceRank}>#{index + 1}</Text>
                        <Text style={styles.serviceName}>{stripIndiePrefix(service.service_name)}</Text>
                      </View>
                      <Text style={styles.serviceValue}>{formatMoney(service.total_earnings ?? 0)}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Нет данных за период</Text>
              )
            )}
          </Card>
        )}

        {/* Графики «Статистика за неделю» - только для мастеров */}
        {isMaster && servicesStats?.weeks_data && servicesStats.weeks_data.length > 0 && (
          <WeeklyStatsCharts weeksData={servicesStats.weeks_data} />
        )}
      </ScrollView>

      {/* Модальное окно "Все записи" — только для master, чтобы client никогда не монтировал и не дергал getMasterSettings */}
      {isMaster && (
        <AllBookingsModal
          visible={showAllBookingsModal}
          onClose={() => setShowAllBookingsModal(false)}
          onConfirmSuccess={() => refreshMasterListsAndCharts()}
          initialMode={allBookingsModalMode}
          hasExtendedStats={features?.has_extended_stats === true}
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
