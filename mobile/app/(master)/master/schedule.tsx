import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabBarHeight } from '@src/contexts/TabBarHeightContext';
import { BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT } from '@src/constants/bottomNavLayout';
import { SegmentedControl } from '@src/components/SegmentedControl';
import { WeekView } from '@src/components/schedule/WeekView';
import { DayView } from '@src/components/schedule/DayView';
import { RulesView } from '@src/components/schedule/RulesView';
import { getWeeklySchedule, getDetailedBookings, getMasterSettings, ScheduleWeek, Booking, MasterSettings } from '@src/services/api/master';
import { CalendarBlock, listCalendarBlocks, rememberVersion } from '@src/services/calendarB3';

type TabIndex = 0 | 1 | 2;

export default function MasterScheduleScreen() {
  const insets = useSafeAreaInsets();
  const { tabBarHeight } = useTabBarHeight();
  const tabBarClearance =
    ((tabBarHeight ?? 0) > 0 ? (tabBarHeight ?? 0) : BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT) + Math.max(insets.bottom, 0);
  const [selectedTab, setSelectedTab] = useState<TabIndex>(0);
  const [schedule, setSchedule] = useState<ScheduleWeek | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlock[]>([]);
  const [blocksError, setBlocksError] = useState<string | null>(null);
  const [masterSettings, setMasterSettings] = useState<MasterSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rulesReloadToken, setRulesReloadToken] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const requestGeneration = useRef(0);
  const currentWeek = useRef(weekOffset);
  currentWeek.current = weekOffset;
  useEffect(() => () => { requestGeneration.current += 1; }, []);
  const [error, setError] = useState<string | null>(null);

  const tabs = [
    { key: 'week', label: 'Неделя' },
    { key: 'day', label: 'День' },
    { key: 'rules', label: 'Правила' },
  ];

  const loadData = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const request = ++requestGeneration.current;
    const isCurrent = () => request === requestGeneration.current && weekOffset === currentWeek.current;
    try {
      setError(null);
      if (!silent) {
        setLoading(true);
      }

      const [scheduleData, bookingsData, settingsData, blockResult] = await Promise.all([
        getWeeklySchedule(weekOffset, 1),
        getDetailedBookings(),
        getMasterSettings(),
        listCalendarBlocks().then(
          (rows) => ({ rows, error: null as string | null }),
          () => ({ rows: [] as CalendarBlock[], error: 'Не удалось загрузить личные блоки' }),
        ),
      ]);

      if (!isCurrent()) return;
      setSchedule(scheduleData);
      bookingsData.forEach((row) => {
        if (row.source === 'manual' && row.version) rememberVersion('booking', row.id, row.version);
      });
      setBookings(bookingsData);
      blockResult.rows.forEach((row) => rememberVersion('block', row.id, row.version));
      setBlocks(blockResult.rows);
      setBlocksError(blockResult.error);
      setMasterSettings(settingsData);
      return { bookings: bookingsData, blocks: blockResult.rows };
    } catch (err: any) {
      if (!isCurrent()) return;
      setError(err.message || 'Ошибка загрузки данных');
      console.error('Error loading schedule data:', err);
      return { bookings: [] as Booking[], blocks: [] as CalendarBlock[] };
    } finally {
      if (isCurrent() && !silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // Keep DayView mounted while its chosen week's data reloads.
    // A full loading screen would discard the date selected in its calendar.
    loadData({ silent: schedule !== null });
  }, [weekOffset]);

  const onPullRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData({ silent: true });
      setRulesReloadToken((t) => t + 1);
    } finally {
      setRefreshing(false);
    }
  };

  const scheduleRefreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />
  );

  const handleWeekChange = (newOffset: number) => {
    setWeekOffset(newOffset);
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 8) }]}>
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.tabsContainer}>
        <SegmentedControl
          segments={tabs}
          selectedIndex={selectedTab}
          onSegmentChange={(index) => setSelectedTab(index as TabIndex)}
        />
      </View>

      <View style={[styles.content, { marginBottom: tabBarClearance }]}>
        {selectedTab === 0 && schedule && (
          <WeekView
            schedule={schedule}
            bookings={bookings}
            weekOffset={weekOffset}
            onWeekChange={handleWeekChange}
            onScheduleUpdated={() => { void loadData({ silent: true }); }}
            masterSettings={masterSettings}
            refreshControl={scheduleRefreshControl}
            hasExtendedStats={false}
            blocks={blocks}
            onEventsChanged={() => { void loadData({ silent: true }); }}
            onReload={() => loadData({ silent: true })}
          />
        )}
        {selectedTab === 1 && schedule && (
          <DayView
            schedule={schedule}
            bookings={bookings}
            blocks={blocks}
            blocksError={blocksError}
            weekOffset={weekOffset}
            onWeekChange={handleWeekChange}
            masterSettings={masterSettings}
            onScheduleUpdated={() => { void loadData({ silent: true }); }}
            onEventsChanged={() => { void loadData({ silent: true }); }}
            onReload={() => loadData({ silent: true })}
            refreshControl={scheduleRefreshControl}
            hasExtendedStats={false}
          />
        )}
        {selectedTab === 2 && (
          <RulesView
            onRuleCreated={() => loadData({ silent: true })}
            refreshControl={scheduleRefreshControl}
            externalReloadToken={rulesReloadToken}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
  },
  tabsContainer: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  content: {
    flex: 1,
  },
});
