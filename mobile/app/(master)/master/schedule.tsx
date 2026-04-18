import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SegmentedControl } from '@src/components/SegmentedControl';
import { WeekView } from '@src/components/schedule/WeekView';
import { DayView } from '@src/components/schedule/DayView';
import { RulesView } from '@src/components/schedule/RulesView';
import { getWeeklySchedule, getDetailedBookings, getMasterSettings, ScheduleWeek, Booking, MasterSettings } from '@src/services/api/master';
import { useMasterFeatures } from '@src/hooks/useMasterFeatures';

type TabIndex = 0 | 1 | 2;

export default function MasterScheduleScreen() {
  const { features } = useMasterFeatures();
  const hasExtendedStats = features?.has_extended_stats === true;
  const insets = useSafeAreaInsets();
  const [selectedTab, setSelectedTab] = useState<TabIndex>(0);
  const [schedule, setSchedule] = useState<ScheduleWeek | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [masterSettings, setMasterSettings] = useState<MasterSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rulesReloadToken, setRulesReloadToken] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const tabs = [
    { key: 'week', label: 'Неделя' },
    { key: 'day', label: 'День' },
    { key: 'rules', label: 'Правила' },
  ];

  const loadData = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    try {
      setError(null);
      if (!silent) {
        setLoading(true);
      }

      const [scheduleData, bookingsData, settingsData] = await Promise.all([
        getWeeklySchedule(weekOffset, 1),
        getDetailedBookings(),
        getMasterSettings(),
      ]);

      setSchedule(scheduleData);
      setBookings(bookingsData);
      setMasterSettings(settingsData);
    } catch (err: any) {
      setError(err.message || 'Ошибка загрузки данных');
      console.error('Error loading schedule data:', err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();
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

      <View style={[styles.content, { marginBottom: 70 + insets.bottom }]}>
        {selectedTab === 0 && schedule && (
          <WeekView
            schedule={schedule}
            bookings={bookings}
            weekOffset={weekOffset}
            onWeekChange={handleWeekChange}
            onScheduleUpdated={() => loadData({ silent: true })}
            masterSettings={masterSettings}
            refreshControl={scheduleRefreshControl}
            hasExtendedStats={hasExtendedStats}
          />
        )}
        {selectedTab === 1 && schedule && (
          <DayView
            schedule={schedule}
            bookings={bookings}
            weekOffset={weekOffset}
            onWeekChange={handleWeekChange}
            masterSettings={masterSettings}
            onScheduleUpdated={() => loadData({ silent: true })}
            refreshControl={scheduleRefreshControl}
            hasExtendedStats={hasExtendedStats}
          />
        )}
        {selectedTab === 2 && schedule && (
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
