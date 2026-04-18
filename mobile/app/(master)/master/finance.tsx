import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
  Alert,
  Pressable,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Card } from '@src/components/Card';
import { TaxRateModal } from '@src/components/modals/TaxRateModal';
import { ExpenseModal } from '@src/components/modals/ExpenseModal';
import { useMasterFeatures } from '@src/hooks/useMasterFeatures';
import { getCheapestPlanForFeature } from '@src/utils/featureAccess';
import { DemoAccessBanner } from '@src/components/DemoAccessBanner';
import { fetchAvailableSubscriptions, SubscriptionType } from '@src/services/api/subscriptions';
import { parseLocalDate } from '@src/utils/date';
import { useAuth } from '@src/auth/AuthContext';
import { useTabBarHeight } from '@src/contexts/TabBarHeightContext';
import { BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT } from '@src/constants/bottomNavLayout';
import {
  AccountingOperation,
  AccountingPeriod,
  AccountingSummary,
  ChartPoint,
  getAccountingOperations,
  getAccountingSummary,
  getCurrentTaxRate,
  TaxRateResponse,
  deleteExpense,
  exportAccounting,
} from '@src/services/api/accounting';
import { formatStatsAxisLabel } from 'shared/statsPeriodLabels';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FINANCE_THEME } from '@src/theme/financeTheme';

if (__DEV__) {
  console.log('[FINANCE UI] finance.tsx loaded v=BTN_EQUAL_1');
  console.log('[FINANCE UI] header buttons compact v=3');
  console.log('[FINANCE UI] demo badge aligned v=1');
}

const SHOW_EXPORT = false;
const PERIOD_OPTIONS: Array<{ value: AccountingPeriod; label: string }> = [
  { value: 'day', label: 'День' },
  { value: 'week', label: 'Неделя' },
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
];

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Дата (новые сначала)', field: 'date', order: 'desc' },
  { value: 'date_asc', label: 'Дата (старые сначала)', field: 'date', order: 'asc' },
  { value: 'amount_desc', label: 'Сумма (по убыванию)', field: 'amount', order: 'desc' },
  { value: 'amount_asc', label: 'Сумма (по возрастанию)', field: 'amount', order: 'asc' },
];

const FLOATING_BAR_HEIGHT = 60;
const FLOATING_BAR_GAP = 8;

const BAR_COLORS = {
  income: FINANCE_THEME.primaryGreen,
  expected: FINANCE_THEME.lightGreen,
  expense: FINANCE_THEME.expenseRed,
};

// Demo summary will be computed dynamically using generateDemoChartData
// This static object is kept for total_* fields computation
const getDemoSummary = (): AccountingSummary => {
  const chartData = generateDemoChartData();
  const total_income = chartData.reduce((sum, p) => sum + (Number(p.income) || 0), 0);
  const total_expected_income = chartData.reduce((sum, p) => sum + (Number(p.expected_income) || 0), 0);
  const total_expense = chartData.reduce((sum, p) => sum + (Number(p.expense) || 0), 0);
  const net_profit = total_income - total_expense;
  
  return {
    total_income,
    total_expected_income,
    total_expense,
    net_profit,
    total_points_spent: 350,
    chart_data: chartData,
    chart_axis_granularity: 'day',
  };
};

const DEMO_TAX_EFFECTIVE_FROM = '2026-01-20';
const DEMO_TAX_BEFORE_RATE = 0;
const DEMO_TAX_AFTER_RATE = 6;

const demoOperations: AccountingOperation[] = [
  {
    id: 'income_1001',
    date: '2026-01-16',
    name: 'Доход от услуги',
    type: 'Доход',
    operation_type: 'income',
    amount: 1500,
    gross_amount: 1500,
  },
  {
    id: 'expense_2001',
    date: '2026-01-15',
    name: 'Аренда кабинета',
    type: 'Расход',
    operation_type: 'expense',
    amount: -1200,
  },
  {
    id: 'income_1002',
    date: '2026-01-21',
    name: 'Доход от услуги',
    type: 'Доход',
    operation_type: 'income',
    amount: 2100,
    gross_amount: 2100,
  },
  {
    id: 'expense_2002',
    date: '2026-01-12',
    name: 'Расходные материалы',
    type: 'Расход',
    operation_type: 'expense',
    amount: -450,
  },
  {
    id: 'income_1003',
    date: '2026-01-10',
    name: 'Доход от услуги',
    type: 'Доход',
    operation_type: 'income',
    amount: 1200,
    gross_amount: 1200,
  },
  {
    id: 'expense_2003',
    date: '2026-01-09',
    name: 'Реклама',
    type: 'Расход',
    operation_type: 'expense',
    amount: -320,
  },
  {
    id: 'income_1004',
    date: '2026-01-23',
    name: 'Доход от услуги',
    type: 'Доход',
    operation_type: 'income',
    amount: 950,
    gross_amount: 950,
  },
  {
    id: 'expense_2004',
    date: '2026-01-05',
    name: 'Косметика',
    type: 'Расход',
    operation_type: 'expense',
    amount: -230,
  },
];

const formatYmd = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Единый с web «Финансы» формат отображения дат в кастомном периоде и в списке операций */
const FINANCE_DATE_PLACEHOLDER = 'дд.мм.гггг';

function ymdToDdMmYyyy(ymd: string): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd.slice(0, 10))) return '';
  const [y, m, d] = ymd.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

function formatFinanceDateDdMmYyyy(value?: string | null): string {
  if (!value) return '';
  const ymd = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymdToDdMmYyyy(ymd);
  const dt = parseLocalDate(ymd);
  if (Number.isNaN(dt.getTime())) return '';
  return ymdToDdMmYyyy(formatYmd(dt));
}

// ============================================================================
// Demo data generator (365 days)
// ============================================================================

/**
 * Generate deterministic demo chart data for last 365 days.
 * Last day = today, values are pseudo-random based on date.
 */
const generateDemoChartData = (): ChartPoint[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result: ChartPoint[] = [];
  
  // Simple deterministic pseudo-random based on date
  const hash = (str: string): number => {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h = h & h; // Convert to 32bit integer
    }
    return Math.abs(h);
  };
  
  for (let i = 364; i >= 0; i--) {
    const date = addDays(today, -i);
    const iso = toISODate(date);
    
    // Deterministic values based on date
    const seed = hash(iso);
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24));
    
    // Sinusoidal pattern with noise for realistic variation
    const baseIncome = 1500 + Math.sin(dayOfYear / 30) * 500 + (seed % 300) - 150;
    const baseExpected = baseIncome * (1.1 + (seed % 10) / 100);
    const baseExpense = baseIncome * (0.15 + (seed % 20) / 200);
    
    result.push({
      date: iso,
      expected_income: Math.round(baseExpected * 100) / 100,
      income: Math.round(baseIncome * 100) / 100,
      expense: Math.round(baseExpense * 100) / 100,
      net_profit: Math.round((baseIncome - baseExpense) * 100) / 100,
    });
  }
  
  return result;
};

// ============================================================================
// Date utilities (pure functions, no React dependencies)
// ============================================================================

/**
 * Parse date string (YYYY-MM-DD or ISO) to Date object.
 * Returns null if invalid, or epoch Date if parsing fails.
 */
const parseDate = (d: string): Date | null => {
  if (!d || typeof d !== 'string') return null;
  const trimmed = d.trim();
  if (!trimmed) return null;
  
  // Try YYYY-MM-DD format first
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const datePart = trimmed.slice(0, 10);
    const parsed = parseLocalDate(datePart);
    if (parsed && !isNaN(parsed.getTime())) return parsed;
  }
  
  // Try ISO format
  const iso = new Date(trimmed);
  if (!isNaN(iso.getTime())) return iso;
  
  return null;
};

/**
 * Convert Date to ISO date string (YYYY-MM-DD).
 */
const toISODate = (date: Date): string => {
  return formatYmd(date);
};

/**
 * Add N days to a date.
 * Uses setDate to handle DST correctly, then normalizes to midnight.
 */
const addDays = (date: Date, n: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + n);
  result.setHours(0, 0, 0, 0);
  return result;
};

/**
 * Get start of week (Monday) for a given date.
 */
const startOfWeek = (date: Date): Date => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day + (day === 0 ? -6 : 1); // Monday = 1
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

/**
 * Check if two dates are the same day.
 */
const sameDay = (a: Date, b: Date): boolean => {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

/**
 * Check if two dates are in the same month.
 */
const sameMonth = (a: Date, b: Date): boolean => {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
};

/**
 * Calculate difference in days between two dates (integer).
 */
const differenceInDays = (dateLeft: Date, dateRight: Date): number => {
  const left = new Date(dateLeft.getFullYear(), dateLeft.getMonth(), dateLeft.getDate());
  const right = new Date(dateRight.getFullYear(), dateRight.getMonth(), dateRight.getDate());
  const diffTime = left.getTime() - right.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

// ============================================================================
// Chart constants
// ============================================================================

const VISIBLE_BUCKETS = 5; // Number of buckets visible in viewport

/**
 * Ширина bucket’а и контента: при малом числе точек растягиваем на всю ширину графика,
 * иначе contentWidth = n * (plot/5) остаётся уже viewport — столбики слипаются слева.
 */
function getChartBucketLayout(plotWidth: number, numPoints: number): {
  bucketWidth: number;
  contentWidth: number;
  scrollEnabled: boolean;
} {
  if (plotWidth <= 0 || numPoints <= 0) {
    return { bucketWidth: 0, contentWidth: 0, scrollEnabled: false };
  }
  const nominalBucket = plotWidth / VISIBLE_BUCKETS;
  const naturalContentWidth = numPoints * nominalBucket;
  const spreadToFullWidth = naturalContentWidth < plotWidth - 0.5;
  const bucketWidth = spreadToFullWidth ? plotWidth / numPoints : nominalBucket;
  const contentWidth = numPoints * bucketWidth;
  const scrollEnabled = contentWidth > plotWidth + 0.5;
  return { bucketWidth, contentWidth, scrollEnabled };
}

/**
 * Get start of quarter (1st day of quarter) for a given date.
 */
const startOfQuarter = (date: Date): Date => {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterMonth, 1);
};

/**
 * Get start of year (Jan 1st) for a given date.
 */
const startOfYear = (date: Date): Date => {
  return new Date(date.getFullYear(), 0, 1);
};

/**
 * Get end of week (Sunday) for a given date.
 */
const endOfWeek = (date: Date): Date => {
  const monday = startOfWeek(date);
  return addDays(monday, 6);
};

/**
 * Get last day of month for a given date.
 */
const lastDayOfMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
};

/**
 * Get last day of quarter for a given date.
 */
const lastDayOfQuarter = (date: Date): Date => {
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterMonth + 3, 0);
};

/**
 * Get first day of month for a given date.
 */
const firstDayOfMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

/**
 * Get first day of quarter for a given date.
 */
const firstDayOfQuarter = (date: Date): Date => {
  return startOfQuarter(date);
};

/** Подписи оси X — тот же контракт, что и графики «Статистика → расширенная» (shared/statsPeriodLabels). */
const financeAxisLabelFromRange = (start: Date, end: Date) =>
  formatStatsAxisLabel(formatYmd(start), formatYmd(end), null);

const financeAxisLabelForTick = (
  period: 'day' | 'week' | 'month' | 'quarter' | 'year',
  d: Date
) => {
  if (period === 'day') return financeAxisLabelFromRange(d, d);
  if (period === 'week') {
    const ws = startOfWeek(d);
    return financeAxisLabelFromRange(ws, addDays(ws, 6));
  }
  if (period === 'month') {
    return financeAxisLabelFromRange(firstDayOfMonth(d), lastDayOfMonth(d));
  }
  if (period === 'quarter') {
    return financeAxisLabelFromRange(startOfQuarter(d), lastDayOfQuarter(d));
  }
  const ys = startOfYear(d);
  const ye = new Date(d.getFullYear(), 11, 31);
  ye.setHours(0, 0, 0, 0);
  return financeAxisLabelFromRange(ys, ye);
};

// ============================================================================
// Data normalization and bucketization
// ============================================================================

/**
 * Normalize chart data to daily keys (YYYY-MM-DD).
 * - Parse dates, normalize to day boundaries
 * - If multiple points for same day, sum their values
 * - Returns Map<isoDay, aggregatedPoint>
 */
const normalizeDaily = (raw: ChartPoint[]): Map<string, ChartPoint> => {
  const dailyMap = new Map<string, ChartPoint>();
  
  for (const point of raw) {
    if (!point.date) continue;
    const date = parseDate(point.date);
    if (!date) continue;
    
    const isoKey = toISODate(date);
    const existing = dailyMap.get(isoKey);
    
    if (existing) {
      // Sum values for same day
      dailyMap.set(isoKey, {
        date: isoKey,
        expected_income: (Number(existing.expected_income) || 0) + (Number(point.expected_income) || 0),
        income: (Number(existing.income) || 0) + (Number(point.income) || 0),
        expense: (Number(existing.expense) || 0) + (Number(point.expense) || 0),
        net_profit: (Number(existing.net_profit) || 0) + (Number(point.net_profit) || 0),
      });
    } else {
      // First point for this day
      dailyMap.set(isoKey, {
        date: isoKey,
        expected_income: Number(point.expected_income) || 0,
        income: Number(point.income) || 0,
        expense: Number(point.expense) || 0,
        net_profit: Number(point.net_profit) || 0,
      });
    }
  }
  
  return dailyMap;
};

interface BucketizeResult {
  points: ChartPoint[];
  labelForIndex: string[];
  hitBoxes: Array<{ startX: number; endX: number }>;
}

/**
 * Bucketize daily data by period.
 * - day: one point per day (densify missing days with zeros)
 * - week: one point per week (Monday-based, sum daily values)
 * - month: one point per month (sum daily values)
 * - quarter: one point per quarter (sum daily values)
 * - year: one point per year (sum daily values)
 */
const bucketize = (
  dailyMap: Map<string, ChartPoint>,
  period: 'day' | 'week' | 'month' | 'quarter' | 'year',
  rangeStart: Date,
  rangeEnd: Date
): BucketizeResult => {
  const points: ChartPoint[] = [];
  const labelForIndex: string[] = [];
  const hitBoxes: Array<{ startX: number; endX: number }> = [];
  
  // Normalize range boundaries
  const rangeStartDay = new Date(rangeStart);
  rangeStartDay.setHours(0, 0, 0, 0);
  const rangeEndDay = new Date(rangeEnd);
  rangeEndDay.setHours(0, 0, 0, 0);
  
  if (__DEV__) {
    console.log('[FINANCE DIAG] bucketize input:', {
      period,
      rangeStartInput: toISODate(rangeStart),
      rangeEndInput: toISODate(rangeEnd),
      rangeStartDay: toISODate(rangeStartDay),
      rangeEndDay: toISODate(rangeEndDay),
      rangeEqual: rangeStartDay.getTime() === rangeEndDay.getTime(),
      diffDays: differenceInDays(rangeEndDay, rangeStartDay) + 1,
    });
  }
  
  if (period === 'day') {
    if (__DEV__) {
      console.log('[FINANCE DIAG] bucketize branch: day');
    }
    // One point per day
    let current = new Date(rangeStartDay);
    let index = 0;
    const expectedBuckets = differenceInDays(rangeEndDay, rangeStartDay) + 1;
    
    if (__DEV__) {
      console.log('[FINANCE DIAG] bucketize day: first iteration:', {
        current: toISODate(current),
        rangeEndDay: toISODate(rangeEndDay),
        currentTime: current.getTime(),
        rangeEndTime: rangeEndDay.getTime(),
        shouldEnter: current.getTime() <= rangeEndDay.getTime(),
        expectedBuckets,
      });
    }
    
    while (current.getTime() <= rangeEndDay.getTime()) {
      const iso = toISODate(current);
      const dailyPoint = dailyMap.get(iso);
      
      points.push(
        dailyPoint || {
          date: iso,
          expected_income: 0,
          income: 0,
          expense: 0,
          net_profit: 0,
        }
      );
      labelForIndex.push(financeAxisLabelFromRange(current, current));
      hitBoxes.push({ startX: index, endX: index + 1 });
      
      if (__DEV__ && index === 0) {
        console.log('[FINANCE DIAG] bucketize day: first bucket added:', {
          iso,
          label: financeAxisLabelFromRange(current, current),
        });
      }
      
      current = addDays(current, 1);
      index++;
    }
    
    if (__DEV__) {
      console.log('[FINANCE DIAG] bucketize day: completed:', {
        iterationsCount: index,
        expectedBuckets,
        pointsLength: points.length,
        lastPointDate: points[points.length - 1]?.date || 'N/A',
      });
    }
  } else if (period === 'week') {
    if (__DEV__) {
      console.log('[FINANCE DIAG] bucketize branch: week');
    }
    // One point per week (Monday-based). Первая неделя — с понедельника недели, содержащей rangeStart;
    // дни до rangeStart внутри недели суммируются (раньше неделя «прыгала» на +7 и отрезала февраль/начало диапазона).
    let currentWeekStart = startOfWeek(rangeStartDay);
    let index = 0;
    const diffDays = differenceInDays(rangeEndDay, rangeStartDay) + 1;
    const expectedBuckets = Math.ceil(diffDays / 7);
    
    if (__DEV__) {
      console.log('[FINANCE DIAG] bucketize week: first iteration:', {
        rangeStartDay: toISODate(rangeStartDay),
        startOfWeekDay: toISODate(startOfWeek(rangeStartDay)),
        currentWeekStart: toISODate(currentWeekStart),
        rangeEndDay: toISODate(rangeEndDay),
        shouldEnter: currentWeekStart.getTime() <= rangeEndDay.getTime(),
        diffDays,
        expectedBuckets,
      });
    }
    
    while (currentWeekStart.getTime() <= rangeEndDay.getTime()) {
      const weekEnd = addDays(currentWeekStart, 6);
      const bucketKey = toISODate(currentWeekStart);
      
      // Sum daily values for this week
      let weekPoint: ChartPoint = {
        date: bucketKey,
        expected_income: 0,
        income: 0,
        expense: 0,
        net_profit: 0,
      };
      
      let dayInWeek = new Date(currentWeekStart);
      while (dayInWeek.getTime() <= weekEnd.getTime() && dayInWeek.getTime() <= rangeEndDay.getTime()) {
        if (dayInWeek.getTime() >= rangeStartDay.getTime()) {
          const iso = toISODate(dayInWeek);
          const dailyPoint = dailyMap.get(iso);
          if (dailyPoint) {
            weekPoint.expected_income += Number(dailyPoint.expected_income) || 0;
            weekPoint.income += Number(dailyPoint.income) || 0;
            weekPoint.expense += Number(dailyPoint.expense) || 0;
            weekPoint.net_profit += Number(dailyPoint.net_profit) || 0;
          }
        }
        dayInWeek = addDays(dayInWeek, 1);
      }
      
      points.push(weekPoint);
      labelForIndex.push(financeAxisLabelFromRange(currentWeekStart, weekEnd));
      hitBoxes.push({ startX: index, endX: index + 1 });
      
      if (__DEV__ && index === 0) {
        console.log('[FINANCE DIAG] bucketize week: first bucket added:', {
          bucketKey,
          label: financeAxisLabelFromRange(currentWeekStart, weekEnd),
        });
      }
      
      currentWeekStart = addDays(currentWeekStart, 7);
      index++;
    }
    
    if (__DEV__) {
      console.log('[FINANCE DIAG] bucketize week: completed:', {
        iterationsCount: index,
        expectedBuckets,
        pointsLength: points.length,
        lastPointDate: points[points.length - 1]?.date || 'N/A',
      });
    }
  } else if (period === 'month') {
    if (__DEV__) {
      console.log('[FINANCE DIAG] bucketize branch: month');
    }
    // One point per month
    let currentMonthStart = new Date(rangeStartDay.getFullYear(), rangeStartDay.getMonth(), 1);
    let index = 0;
    const startYear = rangeStartDay.getFullYear();
    const startMonth = rangeStartDay.getMonth();
    const endYear = rangeEndDay.getFullYear();
    const endMonth = rangeEndDay.getMonth();
    const expectedBuckets = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
    
    if (__DEV__) {
      console.log('[FINANCE DIAG] bucketize month: first iteration:', {
        rangeStartDay: toISODate(rangeStartDay),
        currentMonthStart: toISODate(currentMonthStart),
        rangeEndDay: toISODate(rangeEndDay),
        shouldEnter: currentMonthStart.getTime() <= rangeEndDay.getTime(),
        startYear,
        startMonth,
        endYear,
        endMonth,
        expectedBuckets,
      });
    }
    
    while (currentMonthStart.getTime() <= rangeEndDay.getTime()) {
      const monthEnd = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0);
      monthEnd.setHours(0, 0, 0, 0);
      const actualEnd = monthEnd.getTime() < rangeEndDay.getTime() ? monthEnd : rangeEndDay;
      const bucketKey = toISODate(currentMonthStart);
      
      // Sum daily values for this month
      let monthPoint: ChartPoint = {
        date: bucketKey,
        expected_income: 0,
        income: 0,
        expense: 0,
        net_profit: 0,
      };
      
      const rangeStartClamped =
        currentMonthStart.getTime() < rangeStartDay.getTime() ? rangeStartDay : currentMonthStart;
      if (rangeStartClamped.getTime() > actualEnd.getTime()) {
        points.push(monthPoint);
        labelForIndex.push(financeAxisLabelFromRange(currentMonthStart, monthEnd));
        hitBoxes.push({ startX: index, endX: index + 1 });
        currentMonthStart = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 1);
        index++;
        continue;
      }

      let dayInMonth = new Date(rangeStartClamped);
      while (dayInMonth.getTime() <= actualEnd.getTime()) {
        const iso = toISODate(dayInMonth);
        const dailyPoint = dailyMap.get(iso);
        if (dailyPoint) {
          monthPoint.expected_income += Number(dailyPoint.expected_income) || 0;
          monthPoint.income += Number(dailyPoint.income) || 0;
          monthPoint.expense += Number(dailyPoint.expense) || 0;
          monthPoint.net_profit += Number(dailyPoint.net_profit) || 0;
        }
        dayInMonth = addDays(dayInMonth, 1);
      }
      
      points.push(monthPoint);
      labelForIndex.push(financeAxisLabelFromRange(currentMonthStart, monthEnd));
      hitBoxes.push({ startX: index, endX: index + 1 });
      
      if (__DEV__ && index === 0) {
        console.log('[FINANCE DIAG] bucketize month: first bucket added:', {
          bucketKey,
          label: financeAxisLabelFromRange(currentMonthStart, monthEnd),
        });
      }
      
      currentMonthStart = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 1);
      index++;
    }
    
    if (__DEV__) {
      console.log('[FINANCE DIAG] bucketize month: completed:', {
        iterationsCount: index,
        expectedBuckets,
        pointsLength: points.length,
        lastPointDate: points[points.length - 1]?.date || 'N/A',
      });
    }
  } else if (period === 'quarter') {
    // One point per quarter (календарный квартал). Без сдвига на следующий квартал — иначе терялись февраль–март Q1.
    let currentQuarterStart = startOfQuarter(rangeStartDay);
    let index = 0;
    
    while (currentQuarterStart.getTime() <= rangeEndDay.getTime()) {
      const quarterEnd = new Date(currentQuarterStart.getFullYear(), currentQuarterStart.getMonth() + 3, 0);
      quarterEnd.setHours(0, 0, 0, 0);
      const actualEnd = quarterEnd.getTime() < rangeEndDay.getTime() ? quarterEnd : rangeEndDay;
      const bucketKey = toISODate(currentQuarterStart);
      
      // Sum daily values for this quarter
      let quarterPoint: ChartPoint = {
        date: bucketKey,
        expected_income: 0,
        income: 0,
        expense: 0,
        net_profit: 0,
      };
      
      const qRangeStart =
        currentQuarterStart.getTime() < rangeStartDay.getTime() ? rangeStartDay : currentQuarterStart;
      let dayInQuarter = new Date(qRangeStart);
      while (dayInQuarter.getTime() <= actualEnd.getTime()) {
        const iso = toISODate(dayInQuarter);
        const dailyPoint = dailyMap.get(iso);
        if (dailyPoint) {
          quarterPoint.expected_income += Number(dailyPoint.expected_income) || 0;
          quarterPoint.income += Number(dailyPoint.income) || 0;
          quarterPoint.expense += Number(dailyPoint.expense) || 0;
          quarterPoint.net_profit += Number(dailyPoint.net_profit) || 0;
        }
        dayInQuarter = addDays(dayInQuarter, 1);
      }
      
      points.push(quarterPoint);
      labelForIndex.push(financeAxisLabelFromRange(currentQuarterStart, quarterEnd));
      hitBoxes.push({ startX: index, endX: index + 1 });
      
      const nextQuarterMonth = Math.floor(currentQuarterStart.getMonth() / 3) * 3 + 3;
      currentQuarterStart = new Date(currentQuarterStart.getFullYear(), nextQuarterMonth, 1);
      index++;
    }
  } else if (period === 'year') {
    // One point per year
    let currentYearStart = startOfYear(rangeStartDay);
    let index = 0;
    
    while (currentYearStart.getTime() <= rangeEndDay.getTime()) {
      const yearEnd = new Date(currentYearStart.getFullYear(), 11, 31);
      yearEnd.setHours(0, 0, 0, 0);
      const actualEnd = yearEnd.getTime() < rangeEndDay.getTime() ? yearEnd : rangeEndDay;
      const bucketKey = toISODate(currentYearStart);
      
      // Sum daily values for this year
      let yearPoint: ChartPoint = {
        date: bucketKey,
        expected_income: 0,
        income: 0,
        expense: 0,
        net_profit: 0,
      };
      
      const yRangeStart =
        currentYearStart.getTime() < rangeStartDay.getTime() ? rangeStartDay : currentYearStart;
      let dayInYear = new Date(yRangeStart);
      while (dayInYear.getTime() <= actualEnd.getTime()) {
        const iso = toISODate(dayInYear);
        const dailyPoint = dailyMap.get(iso);
        if (dailyPoint) {
          yearPoint.expected_income += Number(dailyPoint.expected_income) || 0;
          yearPoint.income += Number(dailyPoint.income) || 0;
          yearPoint.expense += Number(dailyPoint.expense) || 0;
          yearPoint.net_profit += Number(dailyPoint.net_profit) || 0;
        }
        dayInYear = addDays(dayInYear, 1);
      }
      
      points.push(yearPoint);
      labelForIndex.push(financeAxisLabelFromRange(currentYearStart, yearEnd));
      hitBoxes.push({ startX: index, endX: index + 1 });
      
      currentYearStart = new Date(currentYearStart.getFullYear() + 1, 0, 1);
      index++;
    }
  }
  
  return { points, labelForIndex, hitBoxes };
};

// ============================================================================
// Chart data normalization
// ============================================================================

interface NormalizedPoint {
  date: Date;
  iso: string;
  expected_income?: number;
  income?: number;
  expense?: number;
  net_profit?: number;
}

/**
 * Densify chart data: fill missing dates with day-grid (NO aggregation).
 * Always generates all days in range, missing values = 0.
 * - rangeStart/rangeEnd: optional date range (if not provided, uses min/max from data)
 */
const densifyChartData = (
  raw: ChartPoint[],
  rangeStart?: Date | null,
  rangeEnd?: Date | null
): ChartPoint[] => {
  // Пустой ответ API + известный диапазон (custom или пресет) → полная дневная сетка с нулями
  if (raw.length === 0) {
    if (rangeStart && rangeEnd) {
      const rangeStartDay = new Date(rangeStart);
      rangeStartDay.setHours(0, 0, 0, 0);
      const rangeEndDay = new Date(rangeEnd);
      rangeEndDay.setHours(0, 0, 0, 0);
      if (rangeStartDay.getTime() <= rangeEndDay.getTime()) {
        const result: ChartPoint[] = [];
        let current = new Date(rangeStartDay);
        while (current.getTime() <= rangeEndDay.getTime()) {
          result.push({
            date: toISODate(current),
            expected_income: 0,
            income: 0,
            expense: 0,
            net_profit: 0,
          });
          current = addDays(current, 1);
        }
        return result;
      }
    }
    return raw;
  }
  
  if (__DEV__) {
    console.log('[FINANCE DIAG] densifyChartData input:', {
      rawLength: raw.length,
      rangeStart: rangeStart ? toISODate(rangeStart) : 'null',
      rangeEnd: rangeEnd ? toISODate(rangeEnd) : 'null',
      first5Raw: raw.slice(0, 5).map(p => ({
        date: p.date,
        income: p.income,
        expected_income: p.expected_income,
        expense: p.expense,
        net_profit: p.net_profit,
      })),
    });
  }
  
  // Parse and sort raw data
  const parsed: Array<{ date: Date; point: ChartPoint }> = [];
  for (const point of raw) {
    if (!point.date) continue;
    const date = parseDate(point.date);
    if (!date) continue;
    parsed.push({ date, point });
  }
  parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  if (parsed.length === 0) {
    if (__DEV__) {
      console.warn('[FINANCE DIAG] densifyChartData: no valid dates parsed, returning raw');
    }
    return raw;
  }
  
  // Use provided range (no expansion - range is truth)
  if (!rangeStart || !rangeEnd) {
    if (__DEV__) {
      console.warn('[FINANCE DIAG] densifyChartData: rangeStart or rangeEnd is missing, falling back to data range');
    }
    const dataMinDate = parsed[0].date;
    const dataMaxDate = parsed[parsed.length - 1].date;
    const dataMinDay = new Date(dataMinDate);
    dataMinDay.setHours(0, 0, 0, 0);
    const dataMaxDay = new Date(dataMaxDate);
    dataMaxDay.setHours(0, 0, 0, 0);
    rangeStart = dataMinDay;
    rangeEnd = dataMaxDay;
  }
  
  // Normalize range boundaries to day
  const rangeStartDay = new Date(rangeStart);
  rangeStartDay.setHours(0, 0, 0, 0);
  const rangeEndDay = new Date(rangeEnd);
  rangeEndDay.setHours(0, 0, 0, 0);
  
  // Create map of existing points - normalize date to YYYY-MM-DD
  // If multiple points have same date, merge their values (sum)
  const pointMap = new Map<string, ChartPoint>();
  parsed.forEach(({ date, point }) => {
    const isoKey = toISODate(date);
    const existing = pointMap.get(isoKey);
    if (existing) {
      // Merge: sum values if multiple points for same day
      pointMap.set(isoKey, {
        date: isoKey,
        expected_income: (Number(existing.expected_income) || 0) + (Number(point.expected_income) || 0),
        income: (Number(existing.income) || 0) + (Number(point.income) || 0),
        expense: (Number(existing.expense) || 0) + (Number(point.expense) || 0),
        net_profit: (Number(existing.net_profit) || 0) + (Number(point.net_profit) || 0),
      });
    } else {
      // Normalize point date to YYYY-MM-DD and ensure all numeric fields are numbers
      pointMap.set(isoKey, {
        date: isoKey,
        expected_income: Number(point.expected_income) || 0,
        income: Number(point.income) || 0,
        expense: Number(point.expense) || 0,
        net_profit: Number(point.net_profit) || 0,
      });
    }
  });
  
  // Generate day-grid: all days in range
  const result: ChartPoint[] = [];
  let current = new Date(rangeStartDay);
  let countExisting = 0;
  
  while (current.getTime() <= rangeEndDay.getTime()) {
    const iso = toISODate(current);
    const existing = pointMap.get(iso);
    if (existing) {
      countExisting++;
      result.push(existing);
    } else {
      result.push({
        date: iso,
        expected_income: 0,
        income: 0,
        expense: 0,
        net_profit: 0,
      });
    }
    current = addDays(current, 1);
  }
  
  if (__DEV__) {
    const first10 = result.slice(0, 10).map(p => ({
      date: p.date,
      income: Number(p.income) || 0,
      expected_income: Number(p.expected_income) || 0,
      expense: Number(p.expense) || 0,
      net_profit: Number(p.net_profit) || 0,
    }));
    const dataMin = parsed.length > 0 ? parsed[0].date : null;
    const dataMax = parsed.length > 0 ? parsed[parsed.length - 1].date : null;
    console.log('[FINANCE DIAG] densifyChartData:', {
      rangeStart: rangeStart ? toISODate(rangeStart) : 'null',
      rangeEnd: rangeEnd ? toISODate(rangeEnd) : 'null',
      parsedLength: parsed.length,
      dataMinDate: dataMin ? toISODate(dataMin) : 'N/A',
      dataMaxDate: dataMax ? toISODate(dataMax) : 'N/A',
      resultLength: result.length,
      countExisting,
      first10Result: first10,
    });
  }
  
  return result;
};

/**
 * Normalize chart data: parse dates, sort, filter invalid.
 */
const normalizeChartData = (raw: ChartPoint[]): NormalizedPoint[] => {
  const normalized: NormalizedPoint[] = [];
  
  for (const point of raw) {
    if (!point.date) continue;
    const date = parseDate(point.date);
    if (!date) continue;
    
    normalized.push({
      date,
      iso: toISODate(date),
      expected_income: Number(point.expected_income) || 0,
      income: Number(point.income) || 0,
      expense: Number(point.expense) || 0,
      net_profit: Number(point.net_profit) || 0,
    });
  }
  
  // Sort by date ascending
  normalized.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  return normalized;
};

// ============================================================================
// X-axis ticks generation
// ============================================================================

interface XTicksResult {
  tickIndexSet: Set<number>;
  labels: string[];
}

/**
 * Build X-axis ticks based on period rules.
 * - day: label for EVERY point
 * - week: label only on Monday (startOfWeek), but if first point is not Monday, label it anyway
 * - month: label on first point of each new month, and always on first point
 */
const buildXTicks = (
  points: NormalizedPoint[],
  period: 'day' | 'week' | 'month' | 'quarter' | 'year'
): XTicksResult => {
  const tickIndexSet = new Set<number>();
  const labels: string[] = [];
  
  if (points.length === 0) {
    return { tickIndexSet, labels };
  }
  
  if (period === 'day') {
    // Label every point
    points.forEach((point, idx) => {
      tickIndexSet.add(idx);
      labels.push(financeAxisLabelForTick(period, point.date));
    });
  } else if (period === 'week') {
    // Label on Mondays, but always label first point
    let lastMonday: Date | null = null;
    
    points.forEach((point, idx) => {
      const pointMonday = startOfWeek(point.date);
      const isMonday = sameDay(point.date, pointMonday);
      
      if (idx === 0) {
        // Always label first point
        tickIndexSet.add(idx);
        labels.push(financeAxisLabelForTick(period, point.date));
        lastMonday = pointMonday;
      } else if (isMonday) {
        // Check if this is a different Monday than the last labeled one
        if (!lastMonday || !sameDay(pointMonday, lastMonday)) {
          tickIndexSet.add(idx);
          labels.push(financeAxisLabelForTick(period, point.date));
          lastMonday = pointMonday;
        }
      }
    });
  } else {
    // month, quarter, year: label on first point of each new month
    let lastMonth: Date | null = null;
    
    points.forEach((point, idx) => {
      if (idx === 0) {
        // Always label first point
        tickIndexSet.add(idx);
        labels.push(financeAxisLabelForTick(period, point.date));
        lastMonth = point.date;
      } else if (!lastMonth || !sameMonth(point.date, lastMonth)) {
        // New month detected
        tickIndexSet.add(idx);
        labels.push(financeAxisLabelForTick(period, point.date));
        lastMonth = point.date;
      }
    });
  }
  
  return { tickIndexSet, labels };
};

// ============================================================================
// Legacy formatting functions (kept for compatibility)
// ============================================================================

const formatDateRu = (value?: string | null, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return '';
  const base = value.slice(0, 10);
  const d = base.includes('-') ? parseLocalDate(base) : new Date(value);
  return d.toLocaleDateString('ru-RU', options);
};

const formatDateShort = (value?: string | null) =>
  formatDateRu(value, { day: '2-digit', month: '2-digit' });

const formatDateFull = (value?: string | null) =>
  formatDateRu(value, { day: '2-digit', month: '2-digit', year: 'numeric' });

const FINANCE_RU_MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const getFinancePeriodLabel = (period: AccountingPeriod, offset: number, dayAnchorYmd?: string): string => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const pad2 = (v: number) => String(v).padStart(2, '0');
  const toDM = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`;
  const toDMY = (d: Date) => `${toDM(d)}.${String(d.getFullYear()).slice(-2)}`;
  const addDaysSafe = (d: Date, days: number) => {
    const n = new Date(d);
    n.setDate(n.getDate() + days);
    return n;
  };
  const addMonthsSafe = (d: Date, months: number) => {
    const n = new Date(d);
    n.setMonth(n.getMonth() + months);
    return n;
  };
  const startOfWeekMonday = (d: Date) => {
    const n = new Date(d);
    const day = n.getDay();
    const shift = day === 0 ? -6 : 1 - day;
    n.setDate(n.getDate() + shift);
    return n;
  };

  if (period === 'day') {
    if (dayAnchorYmd) {
      const ad = parseLocalDate(dayAnchorYmd);
      if (!Number.isNaN(ad.getTime())) return toDMY(ad);
    }
    return toDMY(addDaysSafe(now, offset));
  }
  if (period === 'week') {
    const s = addDaysSafe(startOfWeekMonday(now), offset * 7);
    const e = addDaysSafe(s, 6);
    return `${toDM(s)}–${toDM(e)}`;
  }
  if (period === 'month') {
    const d = addMonthsSafe(now, offset);
    return offset === 0 ? FINANCE_RU_MONTHS[d.getMonth()] : `${FINANCE_RU_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  if (period === 'quarter') {
    const d = addMonthsSafe(now, offset * 3);
    const q = Math.floor(d.getMonth() / 3) + 1;
    return `Q${q} ${String(d.getFullYear()).slice(-2)}`;
  }
  return String(now.getFullYear() + offset);
};

const formatMoney2 = (value: number | string | null | undefined) => {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '0.00 ₽';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const intWithSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${intWithSpaces}.${decPart} ₽`;
};

const parseExpenseId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.match(/expense_(\d+)/);
    if (match) return Number(match[1]);
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
  }
  return null;
};

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (b1 << 16) | (b2 << 8) | b3;
    const enc1 = (triplet >> 18) & 63;
    const enc2 = (triplet >> 12) & 63;
    const enc3 = (triplet >> 6) & 63;
    const enc4 = triplet & 63;
    output += BASE64_CHARS[enc1];
    output += BASE64_CHARS[enc2];
    output += i + 1 < bytes.length ? BASE64_CHARS[enc3] : '=';
    output += i + 2 < bytes.length ? BASE64_CHARS[enc4] : '=';
  }
  return output;
};

function TripleLineChart({ 
  title, 
  data, 
  period,
  rangeStart,
  rangeEnd,
  anchorDate,
}: { 
  title: string; 
  data: ChartPoint[]; 
  period: 'day' | 'week' | 'month' | 'quarter' | 'year';
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  anchorDate?: Date | null;
}) {
  const logOnceRef = useRef<string | null>(null);
  const [chartLayout, setChartLayout] = useState<{ width: number } | null>(null);
  
  // Normalize to daily, then bucketize by period
  const dailyMap = useMemo(() => normalizeDaily(data), [data]);
  const bucketized = useMemo(() => {
    if (!rangeStart || !rangeEnd) {
      if (__DEV__) {
        console.warn('[FINANCE DIAG] TripleBarChart: rangeStart or rangeEnd missing');
      }
      return { points: [], labelForIndex: [], hitBoxes: [] };
    }
    
    // Diagnostic logs
    if (__DEV__) {
      const dailyMin = dailyMap.size > 0 ? Array.from(dailyMap.keys()).sort()[0] : 'N/A';
      const dailyMax = dailyMap.size > 0 ? Array.from(dailyMap.keys()).sort().reverse()[0] : 'N/A';
      console.log('[FINANCE DIAG] TripleBarChart before bucketize:', {
        period,
        rangeStart: toISODate(rangeStart),
        rangeEnd: toISODate(rangeEnd),
        anchorDate: anchorDate ? toISODate(anchorDate) : 'null',
        dailyMapSize: dailyMap.size,
        dailyMin,
        dailyMax,
        rawDataLength: data.length,
      });
    }
    
    const result = bucketize(dailyMap, period, rangeStart, rangeEnd);
    
    if (__DEV__) {
      // Calculate expected buckets based on period
      let expectedBuckets: number;
      if (period === 'day') {
        expectedBuckets = 30;
      } else if (period === 'week') {
        expectedBuckets = 12;
      } else if (period === 'month') {
        expectedBuckets = 12;
      } else if (period === 'quarter') {
        expectedBuckets = 8;
      } else if (period === 'year') {
        expectedBuckets = 5;
      } else {
        expectedBuckets = 0;
      }
      
      const computedBuckets = result.points.length;
      const matches = expectedBuckets === computedBuckets;
      
      console.log('[FINANCE DIAG] TripleBarChart after bucketize:', {
        period,
        rangeStart: toISODate(rangeStart),
        rangeEnd: toISODate(rangeEnd),
        expectedBuckets,
        computedBuckets,
        matches,
        pointsLength: result.points.length,
        labelsLength: result.labelForIndex.length,
        hitBoxesLength: result.hitBoxes.length,
        firstPointDate: result.points[0]?.date || 'N/A',
        lastPointDate: result.points[result.points.length - 1]?.date || 'N/A',
        firstLabel: result.labelForIndex[0] || 'N/A',
        lastLabel: result.labelForIndex[result.labelForIndex.length - 1] || 'N/A',
      });
      
      if (!matches) {
        console.warn('[FINANCE DIAG] TripleBarChart: expectedBuckets !== computedBuckets!', {
          expectedBuckets,
          computedBuckets,
          period,
        });
      }
    }
    
    return result;
  }, [dailyMap, period, rangeStart, rangeEnd, anchorDate, data.length]);
  
  const { points, labelForIndex, hitBoxes } = bucketized;

  const CHART_HEIGHT = 160;
  const BAR_AREA_HEIGHT = 140;

  if (__DEV__) {
    const logKey = `${period}-${rangeStart?.getTime()}-${rangeEnd?.getTime()}-${data.length}-${points.length}`;
    if (logOnceRef.current !== logKey) {
      logOnceRef.current = logKey;
      const rangeDays = rangeStart && rangeEnd 
        ? differenceInDays(rangeEnd, rangeStart) + 1 
        : 'N/A';
      console.log('[FINANCE DIAG] TripleBarChart:', {
        period,
        anchorDate: anchorDate ? toISODate(anchorDate) : 'null',
        rangeStart: rangeStart ? toISODate(rangeStart) : 'null',
        rangeEnd: rangeEnd ? toISODate(rangeEnd) : 'null',
        rangeDays,
        rawDataLength: data.length,
        dailyMapSize: dailyMap.size,
        bucketizedPointsLength: points.length,
        first14Labels: labelForIndex.slice(0, 14),
        first14Dates: points.slice(0, 14).map(p => p.date),
      });
    }
  }
  
  const maxValue = useMemo(() => {
    const values = points.flatMap((d) => [d.expected_income || 0, d.income || 0, d.expense || 0]);
    const max = Math.max(0, ...values);
    const result = max <= 0 ? 1 : max;
    
    if (__DEV__) {
      const maxIncome = Math.max(0, ...points.map(d => d.income || 0));
      const maxExpected = Math.max(0, ...points.map(d => d.expected_income || 0));
      const maxExpense = Math.max(0, ...points.map(d => d.expense || 0));
      console.log('[FINANCE DIAG] TripleBarChart scale:', {
        maxIncome,
        maxExpected,
        maxExpense,
        scaleMax: result,
        pointsLength: points.length,
        sampleValues: points.slice(0, 5).map(d => ({
          date: d.date,
          income: d.income || 0,
          expected: d.expected_income || 0,
          expense: d.expense || 0,
        })),
      });
    }
    
    return result;
  }, [points]);
  
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const selected = selectedIndex !== null ? points[selectedIndex] : null;
  
  // Scroll management
  const scrollViewRef = useRef<ScrollView>(null);
  const lastScrollXRef = useRef<number>(0);
  const didUserScrollRef = useRef<boolean>(false);
  const autoScrollKeyRef = useRef<string>('');
  
  // Calculate dimensions with safe defaults
  const plotWidth = (chartLayout?.width && chartLayout.width > 0) ? chartLayout.width : 350;
  const { bucketWidth, contentWidth, scrollEnabled: chartScrollEnabled } = getChartBucketLayout(
    plotWidth,
    points.length
  );

  // Auto-scroll to end on period/timeOffset change
  const currentAutoScrollKey = `${period}-${rangeStart?.getTime()}-${rangeEnd?.getTime()}`;
  const shouldAutoScroll = autoScrollKeyRef.current !== currentAutoScrollKey;
  
  useEffect(() => {
    // Reset user scroll flag when period/timeOffset changes
    if (autoScrollKeyRef.current !== currentAutoScrollKey) {
      didUserScrollRef.current = false;
    }
    
    if (!scrollViewRef.current) return;
    if (contentWidth <= plotWidth + 0.5) {
      lastScrollXRef.current = 0;
      autoScrollKeyRef.current = currentAutoScrollKey;
      scrollViewRef.current.scrollTo({ x: 0, animated: false });
      return;
    }
    if (shouldAutoScroll && contentWidth > plotWidth) {
      const scrollX = Math.max(0, contentWidth - plotWidth);
      lastScrollXRef.current = scrollX;
      autoScrollKeyRef.current = currentAutoScrollKey;
      
      if (__DEV__) {
        const safeBucketWidth = typeof bucketWidth === 'number' && !isNaN(bucketWidth) ? bucketWidth : 0;
        const safeContentWidth = typeof contentWidth === 'number' && !isNaN(contentWidth) ? contentWidth : 0;
        console.log('[FINANCE DIAG] TripleBarChart auto-scroll:', {
          period,
          pointsLength: points.length,
          plotWidth,
          bucketWidth: safeBucketWidth,
          contentWidth: safeContentWidth,
          initialScrollX: scrollX,
        });
      }
      
      scrollViewRef.current.scrollTo({ x: scrollX, animated: false });
    }
  }, [shouldAutoScroll, contentWidth, plotWidth, period, currentAutoScrollKey, points.length, bucketWidth]);
  
  const handleScroll = (event: any) => {
    const scrollX = event.nativeEvent.contentOffset.x;
    lastScrollXRef.current = scrollX;
    if (!didUserScrollRef.current && Math.abs(scrollX) > 1) {
      didUserScrollRef.current = true;
    }
  };
  
  if (__DEV__ && chartLayout) {
    const logKey = `${period}-${points.length}-${plotWidth}`;
    if (logOnceRef.current !== logKey) {
      logOnceRef.current = logKey;
      const safeBucketWidth = typeof bucketWidth === 'number' && !isNaN(bucketWidth) && bucketWidth > 0 ? bucketWidth : 0;
      const safeContentWidth = typeof contentWidth === 'number' && !isNaN(contentWidth) && contentWidth > 0 ? contentWidth : 0;
      
      console.log('[FINANCE DIAG] TripleBarChart viewport:', {
        period,
        pointsLength: points.length,
        plotWidth,
        bucketWidth: safeBucketWidth > 0 ? safeBucketWidth.toFixed(1) : '0 (not measured)',
        contentWidth: safeContentWidth > 0 ? safeContentWidth.toFixed(1) : '0 (not measured)',
        visibleBuckets: VISIBLE_BUCKETS,
        lineMode: true,
      });
    }
  }
  
  // Early return if layout not measured yet
  if (!chartLayout || !chartLayout.width || chartLayout.width <= 0 || bucketWidth <= 0) {
    return (
      <View>
        {title ? <Text style={styles.chartTitle}>{title}</Text> : null}
        <View
          onLayout={(e) => {
            const width = e.nativeEvent.layout.width;
            if (width > 0) {
              setChartLayout({ width });
            }
          }}
          style={{ height: CHART_HEIGHT }}
        />
      </View>
    );
  }
  
  return (
    <View>
      {title ? <Text style={styles.chartTitle}>{title}</Text> : null}
      <View
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          setChartLayout({ width });
          // Restore scroll position if available
          if (scrollViewRef.current && lastScrollXRef.current > 0) {
            setTimeout(() => {
              scrollViewRef.current?.scrollTo({ x: lastScrollXRef.current, animated: false });
            }, 0);
          }
        }}
      >
        <ScrollView
          ref={scrollViewRef}
          horizontal
          scrollEnabled={chartScrollEnabled}
          showsHorizontalScrollIndicator={chartScrollEnabled}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ height: CHART_HEIGHT }}
        >
          <View style={[styles.chartBarsRow, { 
            width: contentWidth, 
            height: CHART_HEIGHT,
            position: 'relative',
          }]}>
            {/* Линии и точки: SVG (корректная геометрия без View+rotate) */}
            {(() => {
              const baseY = CHART_HEIGHT - 20;
              const toY = (value: number) =>
                baseY - (maxValue > 0 ? Math.max(0, value) / maxValue * BAR_AREA_HEIGHT : 0);
              const cx = (idx: number) => idx * bucketWidth + bucketWidth / 2;
              // Порядок отрисовки: сначала фоновые серии, подтверждённые доходы — сверху; легенда/tooltip — подтверждённые → ожидаемые → расходы
              const series = [
                { key: 'expected_income' as const, color: BAR_COLORS.expected, lineWidth: 1.75, opacity: 0.92 },
                { key: 'expense' as const, color: BAR_COLORS.expense, lineWidth: 2, opacity: 1 },
                { key: 'income' as const, color: BAR_COLORS.income, lineWidth: 2.6, opacity: 1 },
              ];

              return (
                <>
                  <Svg
                    width={contentWidth}
                    height={CHART_HEIGHT}
                    style={{ position: 'absolute', left: 0, top: 0, zIndex: 1 }}
                    pointerEvents="none"
                  >
                    {series.map((s) =>
                      points.map((d, idx) => {
                        if (idx === 0) return null;
                        const prev = points[idx - 1];
                        const x1 = cx(idx - 1);
                        const y1 = toY(Number(prev[s.key]) || 0);
                        const x2 = cx(idx);
                        const y2 = toY(Number(d[s.key]) || 0);
                        return (
                          <Line
                            key={`line-${s.key}-${idx}`}
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke={s.color}
                            strokeWidth={s.lineWidth}
                            strokeOpacity={s.opacity}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      })
                    )}
                    {series.map((s) =>
                      points.map((d, idx) => {
                        const isActive = selectedIndex === idx;
                        const cy = toY(Number(d[s.key]) || 0);
                        return (
                          <Circle
                            key={`dot-${s.key}-${d.date}-${idx}`}
                            cx={cx(idx)}
                            cy={cy}
                            r={isActive ? 5 : 3.5}
                            fill={s.color}
                            fillOpacity={s.opacity}
                            stroke="#fff"
                            strokeWidth={isActive ? 2 : 1.5}
                          />
                        );
                      })
                    )}
                  </Svg>
                  {points.map((_, idx) => {
                    const label = labelForIndex[idx] || '';
                    return (
                      <View
                        key={`lbl-${idx}`}
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          left: idx * bucketWidth,
                          bottom: 0,
                          width: bucketWidth,
                          height: 20,
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          zIndex: 2,
                        }}
                      >
                        <Text style={styles.chartLabel} numberOfLines={1}>
                          {label || '\u00A0'}
                        </Text>
                      </View>
                    );
                  })}
                </>
              );
            })()}
            
            {/* Hit boxes - top layer (for click handling) */}
            {points.map((_, idx) => {
              const left = idx * bucketWidth;
              return (
                <Pressable
                  key={`hit-${idx}`}
                  style={[
                    styles.chartHitBox,
                    {
                      position: 'absolute',
                      left,
                      top: 0,
                      bottom: 0,
                      width: bucketWidth,
                      height: CHART_HEIGHT,
                      backgroundColor: 'transparent',
                      zIndex: 3,
                    },
                  ]}
                  onPress={() => setSelectedIndex((cur) => (cur === idx ? null : idx))}
                />
              );
            })}
          </View>
        </ScrollView>
      </View>
      {selected && (
        <View style={styles.chartTooltip}>
          <Text style={styles.chartTooltipTitle}>{formatDateFull(selected.date)}</Text>
          <View style={styles.chartTooltipRow}>
            <Text style={styles.chartTooltipLabel}>Подтверждённые</Text>
            <Text style={styles.chartTooltipValue}>{formatMoney2(selected.income || 0)}</Text>
          </View>
          <View style={styles.chartTooltipRow}>
            <Text style={styles.chartTooltipLabel}>Ожидаемые</Text>
            <Text style={styles.chartTooltipValue}>{formatMoney2(selected.expected_income || 0)}</Text>
          </View>
          <View style={styles.chartTooltipRow}>
            <Text style={styles.chartTooltipLabel}>Расходы</Text>
            <Text style={styles.chartTooltipValue}>{formatMoney2(selected.expense || 0)}</Text>
          </View>
        </View>
      )}
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: BAR_COLORS.income }]} />
          <Text style={styles.legendText}>Подтверждённые</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: BAR_COLORS.expected }]} />
          <Text style={styles.legendText}>Ожидаемые</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: BAR_COLORS.expense }]} />
          <Text style={styles.legendText}>Расходы</Text>
        </View>
      </View>
    </View>
  );
}

function NetProfitChart({ 
  data, 
  period,
  rangeStart,
  rangeEnd,
  anchorDate,
}: { 
  data: ChartPoint[]; 
  period: 'day' | 'week' | 'month' | 'quarter' | 'year';
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  anchorDate?: Date | null;
}) {
  const [layout, setLayout] = useState<{ w: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const logOnceRef = useRef<string | null>(null);
  const autoscaleLogRef = useRef(false);
  
  // Normalize to daily, then bucketize by period
  const dailyMap = useMemo(() => normalizeDaily(data), [data]);
  const bucketized = useMemo(() => {
    if (!rangeStart || !rangeEnd) {
      if (__DEV__) {
        console.warn('[FINANCE DIAG] NetProfitChart: rangeStart or rangeEnd missing');
      }
      return { points: [], labelForIndex: [], hitBoxes: [] };
    }
    
    // Diagnostic logs
    if (__DEV__) {
      const dailyMin = dailyMap.size > 0 ? Array.from(dailyMap.keys()).sort()[0] : 'N/A';
      const dailyMax = dailyMap.size > 0 ? Array.from(dailyMap.keys()).sort().reverse()[0] : 'N/A';
      console.log('[FINANCE DIAG] NetProfitChart before bucketize:', {
        period,
        rangeStart: toISODate(rangeStart),
        rangeEnd: toISODate(rangeEnd),
        anchorDate: anchorDate ? toISODate(anchorDate) : 'null',
        dailyMapSize: dailyMap.size,
        dailyMin,
        dailyMax,
        rawDataLength: data.length,
      });
    }
    
    const result = bucketize(dailyMap, period, rangeStart, rangeEnd);
    
    if (__DEV__) {
      // Calculate expected buckets based on period
      let expectedBuckets: number;
      if (period === 'day') {
        expectedBuckets = 30;
      } else if (period === 'week') {
        expectedBuckets = 12;
      } else if (period === 'month') {
        expectedBuckets = 12;
      } else if (period === 'quarter') {
        expectedBuckets = 8;
      } else if (period === 'year') {
        expectedBuckets = 5;
      } else {
        expectedBuckets = 0;
      }
      
      const computedBuckets = result.points.length;
      const matches = expectedBuckets === computedBuckets;
      
      console.log('[FINANCE DIAG] NetProfitChart after bucketize:', {
        period,
        rangeStart: toISODate(rangeStart),
        rangeEnd: toISODate(rangeEnd),
        expectedBuckets,
        computedBuckets,
        matches,
        pointsLength: result.points.length,
        labelsLength: result.labelForIndex.length,
        hitBoxesLength: result.hitBoxes.length,
        firstPointDate: result.points[0]?.date || 'N/A',
        lastPointDate: result.points[result.points.length - 1]?.date || 'N/A',
        firstLabel: result.labelForIndex[0] || 'N/A',
        lastLabel: result.labelForIndex[result.labelForIndex.length - 1] || 'N/A',
      });
      
      if (!matches) {
        console.warn('[FINANCE DIAG] NetProfitChart: expectedBuckets !== computedBuckets!', {
          expectedBuckets,
          computedBuckets,
          period,
        });
      }
    }
    
    return result;
  }, [dailyMap, period, rangeStart, rangeEnd, anchorDate, data.length]);
  
  const { points: bucketPoints, labelForIndex, hitBoxes } = bucketized;
  
  if (__DEV__) {
    const logKey = `${period}-${rangeStart?.getTime()}-${rangeEnd?.getTime()}-${data.length}-${bucketPoints.length}`;
    if (logOnceRef.current !== logKey) {
      logOnceRef.current = logKey;
      const rangeDays = rangeStart && rangeEnd 
        ? differenceInDays(rangeEnd, rangeStart) + 1 
        : 'N/A';
      console.log('[FINANCE DIAG] NetProfitChart:', {
        period,
        anchorDate: anchorDate ? toISODate(anchorDate) : 'null',
        rangeStart: rangeStart ? toISODate(rangeStart) : 'null',
        rangeEnd: rangeEnd ? toISODate(rangeEnd) : 'null',
        rangeDays,
        rawDataLength: data.length,
        dailyMapSize: dailyMap.size,
        bucketizedPointsLength: bucketPoints.length,
        first14Labels: labelForIndex.slice(0, 14),
        first14Dates: bucketPoints.slice(0, 14).map(p => p.date),
      });
    }
    if (!autoscaleLogRef.current) {
      console.log('[FINANCE UI] net profit chart autoscale v=1');
      autoscaleLogRef.current = true;
    }
  }
  
  const selected = selectedIndex !== null ? bucketPoints[selectedIndex] : null;
  const NET_PLOT_HEIGHT = 130;
  const NET_PADDING_TOP = 8;
  const NET_PADDING_BOTTOM = 20;
  const DOT_RADIUS = 3;

  const values = useMemo(() => bucketPoints.map((d) => Number(d.net_profit) || 0), [bucketPoints]);
  const min = useMemo(() => Math.min(...values), [values]);
  const max = useMemo(() => Math.max(...values), [values]);
  const paddedRange = useMemo(() => {
    const rawRange = max - min;
    const safeRange = rawRange === 0 ? Math.abs(max) || 1 : rawRange;
    const pad = safeRange * 0.15;
    const result = {
      minY: min - pad,
      maxY: max + pad,
    };
    
    if (__DEV__) {
      console.log('[FINANCE DIAG] NetProfitChart scale:', {
        min,
        max,
        rawRange,
        safeRange,
        pad,
        paddedRange: result,
        bucketizedPointsLength: bucketPoints.length,
        sampleValues: bucketPoints.slice(0, 5).map(d => ({
          date: d.date,
          net_profit: d.net_profit || 0,
        })),
      });
    }
    
    return result;
  }, [min, max, bucketPoints]);

  // Scroll management
  const scrollViewRef = useRef<ScrollView>(null);
  const lastScrollXRef = useRef<number>(0);
  const didUserScrollRef = useRef<boolean>(false);
  const autoScrollKeyRef = useRef<string>('');
  
  const plotWidth = layout?.w || 350;
  const { bucketWidth, contentWidth, scrollEnabled: netChartScrollEnabled } = getChartBucketLayout(
    plotWidth,
    bucketPoints.length
  );
  const plotInnerHeight = NET_PLOT_HEIGHT - (NET_PADDING_TOP + NET_PADDING_BOTTOM + DOT_RADIUS * 2);
  
  // Calculate point positions
  const points = useMemo(() => {
    if (bucketPoints.length === 0) return [];
    return bucketPoints.map((d, i) => {
      const cx = i * bucketWidth + bucketWidth / 2;
      const value = Number(d.net_profit) || 0;
      const denom = paddedRange.maxY - paddedRange.minY || 1;
      const rawT = (value - paddedRange.minY) / denom;
      const t = Math.max(0, Math.min(1, rawT));
      const y = NET_PADDING_TOP + DOT_RADIUS + (1 - t) * plotInnerHeight;
      return { i, cx, y, date: d.date };
    });
  }, [bucketPoints, bucketWidth, paddedRange.maxY, paddedRange.minY, plotInnerHeight]);

  const segments = useMemo(() => {
    if (points.length < 2) return [];
    return points.slice(1).map((p, idx) => {
      const p1 = points[idx];
      const p2 = p;
      const dx = p2.cx - p1.cx;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      return {
        key: `net-seg-${idx}`,
        left: (p1.cx + p2.cx) / 2 - dist / 2,
        top: (p1.y + p2.y) / 2,
        width: dist,
        rotate: `${angle}rad`,
      };
    });
  }, [points]);
  
  // Auto-scroll to end on period/timeOffset change
  const currentAutoScrollKey = `${period}-${rangeStart?.getTime()}-${rangeEnd?.getTime()}`;
  const shouldAutoScroll = autoScrollKeyRef.current !== currentAutoScrollKey;
  
  useEffect(() => {
    // Reset user scroll flag when period/timeOffset changes
    if (autoScrollKeyRef.current !== currentAutoScrollKey) {
      didUserScrollRef.current = false;
    }
    
    if (!scrollViewRef.current) return;
    if (contentWidth <= plotWidth + 0.5) {
      lastScrollXRef.current = 0;
      autoScrollKeyRef.current = currentAutoScrollKey;
      scrollViewRef.current.scrollTo({ x: 0, animated: false });
      return;
    }
    if (shouldAutoScroll && contentWidth > plotWidth) {
      const scrollX = Math.max(0, contentWidth - plotWidth);
      lastScrollXRef.current = scrollX;
      autoScrollKeyRef.current = currentAutoScrollKey;
      
      if (__DEV__) {
        console.log('[FINANCE DIAG] NetProfitChart auto-scroll:', {
          period,
          pointsLength: bucketPoints.length,
          plotWidth,
          bucketWidth,
          contentWidth,
          initialScrollX: scrollX,
        });
      }
      
      scrollViewRef.current.scrollTo({ x: scrollX, animated: false });
    }
  }, [shouldAutoScroll, contentWidth, plotWidth, period, currentAutoScrollKey, bucketPoints.length, bucketWidth]);
  
  const handleScroll = (event: any) => {
    const scrollX = event.nativeEvent.contentOffset.x;
    lastScrollXRef.current = scrollX;
    if (!didUserScrollRef.current && Math.abs(scrollX) > 1) {
      didUserScrollRef.current = true;
    }
  };
  
  if (__DEV__ && layout) {
    const logKey = `${period}-${bucketPoints.length}-${plotWidth}`;
    if (logOnceRef.current !== logKey) {
      logOnceRef.current = logKey;
      console.log('[FINANCE DIAG] NetProfitChart viewport:', {
        period,
        pointsLength: bucketPoints.length,
        plotWidth,
        bucketWidth: bucketWidth.toFixed(1),
        contentWidth: contentWidth.toFixed(1),
        visibleBuckets: VISIBLE_BUCKETS,
      });
    }
  }
  
  return (
    <View>
      <View
        style={styles.netChart}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          setLayout({ w: width });
          // Restore scroll position if available
          if (scrollViewRef.current && lastScrollXRef.current > 0) {
            setTimeout(() => {
              scrollViewRef.current?.scrollTo({ x: lastScrollXRef.current, animated: false });
            }, 0);
          }
        }}
      >
        <ScrollView
          ref={scrollViewRef}
          horizontal
          scrollEnabled={netChartScrollEnabled}
          showsHorizontalScrollIndicator={netChartScrollEnabled}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          nestedScrollEnabled
          directionalLockEnabled={Platform.OS === 'ios'}
        >
          <View style={[styles.netPlotArea, { width: contentWidth, position: 'relative' }]}>
            {/* Hit boxes - full height clickable zones */}
            {bucketPoints.map((_, idx) => {
              const left = idx * bucketWidth;
              return (
                <Pressable
                  key={`net-hit-${idx}`}
                  onPress={() => setSelectedIndex((cur) => (cur === idx ? null : idx))}
                  style={[
                    styles.netHitZone,
                    {
                      position: 'absolute',
                      left,
                      width: bucketWidth,
                      top: 0,
                      height: NET_PLOT_HEIGHT,
                    },
                  ]}
                />
              );
            })}
            
            {/* Segments */}
            {segments.map((s) => (
              <View
                key={s.key}
                style={[
                  styles.netLine,
                  { left: s.left, top: s.top, width: s.width, transform: [{ rotateZ: s.rotate }] },
                ]}
                pointerEvents="none"
              />
            ))}
            
            {/* Dots */}
            {points.map((p) => (
              <View
                key={`net-dot-${p.i}`}
                style={[styles.netDot, { left: p.cx - 3, top: p.y - 3 }]}
                pointerEvents="none"
              />
            ))}
            
            {/* X-axis labels */}
            {bucketPoints.map((_, idx) => {
              const label = labelForIndex[idx] || '';
              const left = idx * bucketWidth;
              return (
                <View
                  key={`net-label-${idx}`}
                  style={[
                    styles.netLabel,
                    {
                      position: 'absolute',
                      left,
                      width: bucketWidth,
                      top: NET_PLOT_HEIGHT - NET_PADDING_BOTTOM,
                    },
                  ]}
                  pointerEvents="none"
                >
                  <Text style={[styles.netLabelText, { textAlign: 'center' }]}>{label || '\u00A0'}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
      {selected && (
        <View style={styles.chartTooltip}>
          <Text style={styles.chartTooltipTitle}>{formatDateFull(selected.date)}</Text>
          <View style={styles.chartTooltipRow}>
            <Text style={styles.chartTooltipLabel}>Прибыль</Text>
            <Text style={styles.chartTooltipValue}>{formatMoney2(selected.net_profit || 0)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function DemoBadge() {
  return (
    <View style={styles.demoBadge}>
      <Text style={styles.demoBadgeText}>Демо</Text>
    </View>
  );
}

function SectionHeader({ title, showDemo }: { title: string; showDemo: boolean }) {
  if (__DEV__) {
    console.log('[FINANCE UI] SectionHeader aligned v=2');
    console.log('[FINANCE UI] section header right-badge v=3');
  }
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
      {showDemo && <DemoBadge />}
    </View>
  );
}

export default function MasterFinanceScreen() {
  const { features, loading: featuresLoading } = useMasterFeatures();
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { tabBarHeight } = useTabBarHeight();
  const [plans, setPlans] = useState<any[]>([]);

  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [operations, setOperations] = useState<AccountingOperation[]>([]);
  const [currentTaxRate, setCurrentTaxRate] = useState<TaxRateResponse | null>(null);
  const [editingExpense, setEditingExpense] = useState<AccountingOperation | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [demoDismissed, setDemoDismissed] = useState(false);
  /** Любая успешно загруженная финансовая активность за сессию — не откатываться в demo на пустом диапазоне */
  const [hasSeenFinanceActivity, setHasSeenFinanceActivity] = useState(false);

  const [selectedPeriod, setSelectedPeriod] = useState<AccountingPeriod>('week');
  const [timeOffset, setTimeOffset] = useState(0);
  const [dayAnchorDate, setDayAnchorDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [useCustomDates, setUseCustomDates] = useState(false);

  const [operationTypeFilter, setOperationTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [sortField, setSortField] = useState<'date' | 'amount' | 'name'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [summaryLoading, setSummaryLoading] = useState(true);
  const [operationsLoading, setOperationsLoading] = useState(true);
  const [taxLoading, setTaxLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [operationsError, setOperationsError] = useState('');
  const [taxError, setTaxError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [isTaxModalOpen, setIsTaxModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [dateRangeError, setDateRangeError] = useState('');
  const [isSortOpen, setIsSortOpen] = useState(false);

  /** Единый модальный сценарий выбора дат (одинаковые заголовки на iOS/Android) */
  const [financeDateModalOpen, setFinanceDateModalOpen] = useState(false);
  const [financeDateStep, setFinanceDateStep] = useState<'start' | 'end'>('start');

  const summaryReqIdRef = useRef(0);
  const operationsReqIdRef = useRef(0);
  const taxReqIdRef = useRef(0);

  const hasFinanceAccess = features?.has_finance_access === true;
  const cheapestPlanName = getCheapestPlanForFeature(plans, 'has_finance_access');

  useEffect(() => {
    if (features) {
      fetchAvailableSubscriptions(SubscriptionType.MASTER)
        .then(setPlans)
        .catch((err) => console.error('Error loading plans:', err));
    }
  }, [features]);

  useEffect(() => {
    if (startDate && endDate) {
      const start = parseLocalDate(startDate);
      const end = parseLocalDate(endDate);
      if (start > end) {
        setDateRangeError('Дата начала не может быть позже даты конца');
        return;
      }
    }
    setDateRangeError('');
    setUseCustomDates(Boolean(startDate && endDate));
  }, [startDate, endDate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedPeriod, useCustomDates, startDate, endDate, operationTypeFilter]);

  const loadSummary = async () => {
    if (useCustomDates && startDate && endDate) {
      const start = parseLocalDate(startDate);
      const end = parseLocalDate(endDate);
      if (start > end) return;
    }
    const reqId = ++summaryReqIdRef.current;
    try {
      setSummaryLoading(true);
      setSummaryError('');
      const data =
        useCustomDates && startDate && endDate
          ? await getAccountingSummary({ start_date: startDate, end_date: endDate })
          : selectedPeriod === 'day'
            ? await getAccountingSummary({
                period: 'day',
                offset: 0,
                anchor_date: dayAnchorDate,
                window_before: 9,
                window_after: 9,
              })
            : await getAccountingSummary({ period: selectedPeriod, offset: timeOffset });
      if (reqId !== summaryReqIdRef.current) return;
      setSummary(data);
    } catch (err) {
      if (reqId !== summaryReqIdRef.current) return;
      console.error('Error loading accounting summary:', err);
      setSummaryError('Не удалось загрузить сводку');
    } finally {
      if (reqId !== summaryReqIdRef.current) return;
      setSummaryLoading(false);
    }
  };

  const loadOperations = async () => {
    if (useCustomDates && startDate && endDate) {
      const start = parseLocalDate(startDate);
      const end = parseLocalDate(endDate);
      if (start > end) return;
    }
    const reqId = ++operationsReqIdRef.current;
    try {
      setOperationsLoading(true);
      setOperationsError('');
      const response = await getAccountingOperations({
        page: currentPage,
        limit: 20,
        ...(useCustomDates && startDate && endDate
          ? { start_date: startDate, end_date: endDate }
          : selectedPeriod === 'day'
            ? {
                period: 'day',
                offset: 0,
                anchor_date: dayAnchorDate,
                window_before: 9,
                window_after: 9,
              }
            : { period: selectedPeriod, offset: timeOffset }),
        operation_type: operationTypeFilter === 'all' ? undefined : operationTypeFilter,
      });
      if (reqId !== operationsReqIdRef.current) return;
      const ops = response.operations || [];
      setOperations(ops);
      const pages = response.pages || Math.max(1, Math.ceil((response.total || ops.length) / 20));
      setTotalPages(pages);
    } catch (err) {
      if (reqId !== operationsReqIdRef.current) return;
      console.error('Error loading accounting operations:', err);
      setOperationsError('Не удалось загрузить операции');
    } finally {
      if (reqId !== operationsReqIdRef.current) return;
      setOperationsLoading(false);
    }
  };

  const loadCurrentTaxRate = async () => {
    const reqId = ++taxReqIdRef.current;
    try {
      setTaxLoading(true);
      setTaxError('');
      const data = await getCurrentTaxRate();
      if (reqId !== taxReqIdRef.current) return;
      setCurrentTaxRate(data);
    } catch (err) {
      if (reqId !== taxReqIdRef.current) return;
      console.error('Error loading tax rate:', err);
      setTaxError('Не удалось загрузить налоговую ставку');
    } finally {
      if (reqId !== taxReqIdRef.current) return;
      setTaxLoading(false);
    }
  };

  const loadAll = async () => {
    await Promise.all([loadSummary(), loadOperations(), loadCurrentTaxRate()]);
    setRefreshing(false);
  };

  useEffect(() => {
    if (!hasFinanceAccess || featuresLoading) return;
    loadSummary();
    loadOperations();
    loadCurrentTaxRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasFinanceAccess,
    featuresLoading,
    selectedPeriod,
    timeOffset,
    dayAnchorDate,
    useCustomDates,
    startDate,
    endDate,
    operationTypeFilter,
    currentPage,
  ]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadAll();
  };

  const handlePeriodChange = (period: AccountingPeriod) => {
    if (__DEV__) {
      console.log('[FINANCE DIAG] handlePeriodChange called:', {
        oldPeriod: selectedPeriod,
        newPeriod: period,
        timeOffset,
        startDate,
        endDate,
        useCustomDates,
      });
    }
    setSelectedPeriod(period);
    setTimeOffset(0);
    if (period === 'day') {
      setDayAnchorDate(new Date().toISOString().slice(0, 10));
    }
    setStartDate('');
    setEndDate('');
    setUseCustomDates(false);
    setFinanceDateModalOpen(false);
    setFinanceDateStep('start');
  };

  const handleFinanceDatePicked = (event: any, date?: Date) => {
    if (event?.type === 'dismissed') {
      setFinanceDateModalOpen(false);
      setFinanceDateStep('start');
      return;
    }
    if (Platform.OS === 'android' && event?.type !== 'set') {
      return;
    }
    if (!date) return;

    const next = formatYmd(date);
    if (financeDateStep === 'start') {
      setStartDate(next);
      setEndDate((prev) => {
        if (!prev) return next;
        if (parseLocalDate(prev) < parseLocalDate(next)) return next;
        return prev;
      });
      if (Platform.OS === 'android') {
        setFinanceDateModalOpen(false);
        setTimeout(() => {
          setFinanceDateStep('end');
          setFinanceDateModalOpen(true);
        }, 120);
      } else {
        setFinanceDateStep('end');
      }
      return;
    }

    setEndDate(next);
    setStartDate((prev) => {
      if (!prev) return next;
      if (parseLocalDate(prev) > parseLocalDate(next)) return next;
      return prev;
    });
    setFinanceDateModalOpen(false);
    setFinanceDateStep('start');
  };

  const openFinanceDatePicker = (step: 'start' | 'end') => {
    setFinanceDateStep(step);
    setFinanceDateModalOpen(true);
  };

  const closeFinanceDateModal = () => {
    setFinanceDateModalOpen(false);
    setFinanceDateStep('start');
  };

  const handleDeleteExpense = (operation: AccountingOperation) => {
    const parsedId = parseExpenseId(operation.id);
    if (!parsedId) return;
    Alert.alert(
      'Удалить расход?',
      'Вы уверены, что хотите удалить этот расход?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExpense(parsedId);
              loadOperations();
              loadSummary();
            } catch (err: any) {
              console.error('Ошибка при удалении расхода:', err);
              const status = err?.status;
              let message = 'Не удалось удалить расход.';
              if (status === 403) {
                message = 'Нет доступа. Нужна подписка Pro.';
              } else if (status === 404) {
                message = 'Расход не найден или уже удалён.';
              } else if (status >= 500) {
                message = 'Ошибка сервера. Попробуйте позже.';
              }
              Alert.alert('Удаление не выполнено', message);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleExport = async (format: 'excel' | 'csv') => {
    if (effectiveDemoMode) {
      Alert.alert('Экспорт', 'Экспорт недоступен в демо-режиме.');
      return;
    }
    if (exporting) return;
    setExporting(true);
    try {
      const params = useCustomDates && startDate && endDate
        ? { start_date: startDate, end_date: endDate }
        : undefined;
      const { data, filename, mime } = await exportAccounting(format, params);
      const base64 = arrayBufferToBase64(data);
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Экспорт завершён', `Файл сохранён: ${fileUri}`);
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: mime,
        dialogTitle: 'Экспорт операций',
      });
    } catch (err: any) {
      const status = err?.status;
      let message = 'Не удалось экспортировать.';
      if (status === 401) {
        await logout();
        Alert.alert('Сессия истекла', 'Пожалуйста, войдите заново.');
        return;
      }
      if (status === 403) {
        message = 'Нет доступа (нужен Pro)';
      } else if (format === 'csv' && status === 500) {
        message = 'CSV временно недоступен, используйте Excel';
      }
      Alert.alert('Экспорт', message);
    } finally {
      setExporting(false);
    }
  };

  const sortedOperations = useMemo(() => {
    const copy = [...operations];
    const dir = sortOrder === 'asc' ? 1 : -1;
    const safeDate = (v?: string) => {
      const t = v ? new Date(v).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    copy.sort((a, b) => {
      if (sortField === 'date' || sortField !== 'amount') {
        return (safeDate(a.date) - safeDate(b.date)) * dir;
      }
      return ((Number(a.amount) || 0) - (Number(b.amount) || 0)) * dir;
    });
    return copy;
  }, [operations, sortField, sortOrder]);

  const emptyText = 'Нет данных за период. Попробуйте выбрать другой период.';
  const financeDataLoading = summaryLoading || operationsLoading;
  const hasRealOperations =
    !operationsLoading &&
    !operationsError &&
    sortedOperations.length > 0;
  const hasRealChartData =
    !summaryLoading &&
    !summaryError &&
    (summary?.chart_data?.length || 0) > 0;
  const hasRealSummaryTotals =
    !summaryLoading &&
    !summaryError &&
    summary != null &&
    (Number(summary.total_income) > 0 ||
      Number(summary.total_expected_income) > 0 ||
      Number(summary.total_expense) > 0);
  const hasRealData =
    hasRealOperations || hasRealChartData || hasRealSummaryTotals;
  const isTrulyEmpty =
    !hasRealData &&
    !summaryLoading &&
    !operationsLoading &&
    !summaryError &&
    !operationsError;
  useEffect(() => {
    if (financeDataLoading || hasSeenFinanceActivity) return;
    if (!summaryError && summary) {
      const chartLen = summary.chart_data?.length ?? 0;
      if (hasRealSummaryTotals || chartLen > 0) setHasSeenFinanceActivity(true);
    }
    if (!operationsError && sortedOperations.length > 0) setHasSeenFinanceActivity(true);
  }, [
    financeDataLoading,
    hasSeenFinanceActivity,
    summary,
    summaryError,
    operationsError,
    sortedOperations.length,
    hasRealSummaryTotals,
  ]);
  const effectiveDemoMode =
    !hasFinanceAccess ||
    (!financeDataLoading &&
      !hasSeenFinanceActivity &&
      !hasRealData &&
      !demoDismissed);
  const showEmptyCard =
    hasFinanceAccess && !effectiveDemoMode && isTrulyEmpty;
  const showPlaceholders =
    hasFinanceAccess &&
    !effectiveDemoMode &&
    !hasRealData &&
    !summaryLoading &&
    !operationsLoading &&
    !summaryError &&
    !operationsError;

  // ============================================================================
  // Demo data (generated dynamically, always ends at today)
  // ============================================================================
  const demoSummaryData = useMemo(() => {
    if (!effectiveDemoMode) return null;
    return getDemoSummary();
  }, [effectiveDemoMode]);

  // Demo operations date shifting (only for operations, not chart_data)
  const demoDateShift = useMemo(() => {
    if (!effectiveDemoMode) return 0;
    
    // Find max date in demo operations
    let maxDate: Date | null = null;
    
    for (const op of demoOperations) {
      const date = parseDate(op.date);
      if (date && (!maxDate || date.getTime() > maxDate.getTime())) {
        maxDate = date;
      }
    }
    
    if (!maxDate) return 0;
    
    // Get today (local date, zeroed to day start)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Calculate delta
    return differenceInDays(today, maxDate);
  }, [effectiveDemoMode]);

  // Shift demo operations and apply tax logic
  const demoSortedOperations = useMemo(() => {
    if (!effectiveDemoMode) return [];
    
    // Parse DEMO_TAX_EFFECTIVE_FROM as Date and shift it
    const baseTaxEffectiveFrom = parseDate(DEMO_TAX_EFFECTIVE_FROM);
    const taxEffectiveFromDate = baseTaxEffectiveFrom 
      ? addDays(baseTaxEffectiveFrom, demoDateShift)
      : null;
    
    const copy = demoOperations.map((op) => {
      const opDate = parseDate(op.date);
      if (!opDate) return op;
      
      // Shift date
      const shiftedDate = addDays(opDate, demoDateShift);
      const shiftedDateStr = toISODate(shiftedDate);
      
      if (op.operation_type !== 'income') {
        return {
          ...op,
          date: shiftedDateStr,
        };
      }
      
      // Apply tax logic using Date comparison
      const gross = Number(op.gross_amount ?? op.amount ?? 0);
      let rate = DEMO_TAX_BEFORE_RATE;
      if (taxEffectiveFromDate && shiftedDate.getTime() >= taxEffectiveFromDate.getTime()) {
        rate = DEMO_TAX_AFTER_RATE;
      }
      
      const taxAmount = gross * (rate / 100);
      const net = gross - taxAmount;
      return {
        ...op,
        date: shiftedDateStr,
        amount: gross,
        gross_amount: gross,
        tax_rate: rate,
        net_amount: net,
      };
    });
    
    if (__DEV__) {
      console.log('[FINANCE UI][DEMO TAX] demoDateShift:', demoDateShift);
      console.log('[FINANCE UI][DEMO TAX] taxEffectiveFromDate:', taxEffectiveFromDate?.toISOString());
      console.log('[FINANCE UI][DEMO TAX] currentTaxRate', currentTaxRate);
      copy.slice(0, 5).forEach((op) => {
        if (op.operation_type !== 'income') return;
        const gross = Number(op.gross_amount ?? op.amount ?? 0);
        const rate = Number(op.tax_rate ?? 0);
        const taxAmount = gross * (rate / 100);
        const net = Number(op.net_amount ?? gross - taxAmount);
        console.log('[FINANCE UI][DEMO TAX] op', {
          date: op.date,
          gross,
          taxRateUsed: rate,
          taxAmount,
          net,
        });
      });
    }
    
    const dir = sortOrder === 'asc' ? 1 : -1;
    const safeDate = (v?: string) => {
      const t = v ? new Date(v).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    copy.sort((a, b) => {
      if (sortField === 'date') return (safeDate(a.date) - safeDate(b.date)) * dir;
      if (sortField === 'amount') return ((Number(a.amount) || 0) - (Number(b.amount) || 0)) * dir;
      const aName = (a.name || a.type || '').toString();
      const bName = (b.name || b.type || '').toString();
      return aName.localeCompare(bName, 'ru') * dir;
    });
    return copy;
  }, [effectiveDemoMode, demoDateShift, sortField, sortOrder, currentTaxRate]);

  const effectiveSummary = effectiveDemoMode ? (demoSummaryData || getDemoSummary()) : summary;
  const effectiveOperations = effectiveDemoMode ? demoSortedOperations : sortedOperations;
  
  // Compute rangeStart/rangeEnd for densifyChartData
  // If useCustomDates: use startDate/endDate
  // Otherwise: compute from selectedPeriod + timeOffset (same logic as API requests)
  const { chartRangeStart, chartRangeEnd, anchorDate } = useMemo(() => {
    if (useCustomDates && startDate && endDate) {
      const start = parseDate(startDate);
      const end = parseDate(endDate);
      if (start && end) {
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        return { chartRangeStart: start, chartRangeEnd: end, anchorDate: null };
      }
    }
    
    // Compute range as a window of multiple periods
    // anchorEnd = end of the window (based on selectedPeriod + timeOffset)
    // rangeStart = start of the window (anchorEnd - N periods)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let anchorEnd: Date;
    let rangeStart: Date;
    let rangeEnd: Date;
    let anchor: Date;
    
    if (selectedPeriod === 'day') {
      // Window: 30 days — якорь дня как у web (dayAnchorDate), не legacy offset±2
      anchorEnd = parseLocalDate(dayAnchorDate);
      anchorEnd.setHours(0, 0, 0, 0);
      // rangeStart = anchorEnd - 29 days (30 days total)
      rangeStart = addDays(anchorEnd, -29);
      rangeEnd = anchorEnd;
      anchor = anchorEnd;
    } else if (selectedPeriod === 'week') {
      // Window: 12 weeks
      // anchorEnd = endOfWeek(today) + timeOffset weeks
      const todayWeekEnd = endOfWeek(today);
      anchorEnd = addDays(todayWeekEnd, timeOffset * 7);
      anchorEnd.setHours(0, 0, 0, 0);
      // rangeStart = startOfWeek(anchorEnd) - (12-1) weeks = anchorEnd - 11 weeks
      const anchorEndWeekStart = startOfWeek(anchorEnd);
      rangeStart = addDays(anchorEndWeekStart, -11 * 7);
      rangeEnd = anchorEnd;
      anchor = startOfWeek(anchorEnd);
    } else if (selectedPeriod === 'month') {
      // Window: 12 months
      // anchorEnd = lastDayOfMonth(targetMonth) where targetMonth = current month + timeOffset
      const targetMonth = today.getMonth() + timeOffset;
      const targetYear = today.getFullYear() + Math.floor(targetMonth / 12);
      const normalizedMonth = ((targetMonth % 12) + 12) % 12;
      const targetMonthDate = new Date(targetYear, normalizedMonth, 1);
      anchorEnd = lastDayOfMonth(targetMonthDate);
      anchorEnd.setHours(0, 0, 0, 0);
      // rangeStart = firstDayOfMonth(targetMonth - 11 months)
      // Calculate targetMonth - 11
      const rangeStartMonth = normalizedMonth - 11;
      const rangeStartYear = targetYear + Math.floor(rangeStartMonth / 12);
      const normalizedRangeStartMonth = ((rangeStartMonth % 12) + 12) % 12;
      rangeStart = new Date(rangeStartYear, normalizedRangeStartMonth, 1);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = anchorEnd;
      anchor = firstDayOfMonth(anchorEnd);
    } else if (selectedPeriod === 'quarter') {
      // Window: 8 quarters
      // anchorEnd = lastDayOfQuarter(targetQuarter) where targetQuarter = current quarter + timeOffset
      const currentMonth = today.getMonth();
      const currentQuarter = Math.floor(currentMonth / 3);
      const targetQuarter = currentQuarter + timeOffset;
      const targetYear = today.getFullYear() + Math.floor(targetQuarter / 4);
      const normalizedQuarter = ((targetQuarter % 4) + 4) % 4;
      const firstMonthOfQuarter = normalizedQuarter * 3;
      const targetQuarterDate = new Date(targetYear, firstMonthOfQuarter, 1);
      anchorEnd = lastDayOfQuarter(targetQuarterDate);
      anchorEnd.setHours(0, 0, 0, 0);
      // rangeStart = firstDayOfQuarter(targetQuarter - 7)
      const rangeStartQuarter = targetQuarter - 7;
      const rangeStartYear = today.getFullYear() + Math.floor(rangeStartQuarter / 4);
      const normalizedRangeStartQuarter = ((rangeStartQuarter % 4) + 4) % 4;
      const rangeStartFirstMonth = normalizedRangeStartQuarter * 3;
      rangeStart = new Date(rangeStartYear, rangeStartFirstMonth, 1);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = anchorEnd;
      anchor = firstDayOfQuarter(anchorEnd);
    } else if (selectedPeriod === 'year') {
      // Window: 5 years
      // anchorEnd = Dec 31 (targetYear) where targetYear = current year + timeOffset
      const targetYear = today.getFullYear() + timeOffset;
      anchorEnd = new Date(targetYear, 11, 31);
      anchorEnd.setHours(0, 0, 0, 0);
      // rangeStart = Jan 1 (targetYear - 4)
      rangeStart = new Date(targetYear - 4, 0, 1);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = anchorEnd;
      anchor = new Date(targetYear, 0, 1);
      anchor.setHours(0, 0, 0, 0);
    } else {
      // Fallback to month (should not happen)
      const targetMonth = today.getMonth() + timeOffset;
      const targetYear = today.getFullYear() + Math.floor(targetMonth / 12);
      const normalizedMonth = ((targetMonth % 12) + 12) % 12;
      const targetMonthDate = new Date(targetYear, normalizedMonth, 1);
      anchorEnd = lastDayOfMonth(targetMonthDate);
      anchorEnd.setHours(0, 0, 0, 0);
      const anchorEndFirstDay = firstDayOfMonth(anchorEnd);
      rangeStart = new Date(anchorEndFirstDay);
      rangeStart.setMonth(rangeStart.getMonth() - 11);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = anchorEnd;
      anchor = firstDayOfMonth(anchorEnd);
    }
    
    // Calculate expected buckets for diagnostic log
    let expectedBuckets: number;
    if (selectedPeriod === 'day') {
      expectedBuckets = 30;
    } else if (selectedPeriod === 'week') {
      expectedBuckets = 12;
    } else if (selectedPeriod === 'month') {
      expectedBuckets = 12;
    } else if (selectedPeriod === 'quarter') {
      expectedBuckets = 8;
    } else if (selectedPeriod === 'year') {
      expectedBuckets = 5;
    } else {
      expectedBuckets = 12; // fallback
    }
    
    if (__DEV__) {
      const rangeDays = differenceInDays(rangeEnd, rangeStart) + 1;
      console.log('[FINANCE DIAG] Range computation result:', {
        selectedPeriod,
        timeOffset,
        useCustomDates,
        anchorISO: toISODate(anchor),
        anchorEndISO: toISODate(anchorEnd),
        rangeStartISO: toISODate(rangeStart),
        rangeEndISO: toISODate(rangeEnd),
        rangeDays,
        expectedBuckets,
        rangeEqual: rangeStart.getTime() === rangeEnd.getTime(),
      });
    }
    
    return { chartRangeStart: rangeStart, chartRangeEnd: rangeEnd, anchorDate: anchor };
  }, [useCustomDates, startDate, endDate, selectedPeriod, timeOffset, dayAnchorDate]);

  /** Окно графика: для пресета «Неделя» — ровно start/end из ответа API (7 дней), не 12-недельный скролл */
  const financeChartViewport = useMemo(() => {
    if (effectiveDemoMode || useCustomDates) {
      return {
        rangeStart: chartRangeStart,
        rangeEnd: chartRangeEnd,
        anchor: anchorDate,
      };
    }
    if (selectedPeriod === 'week' && summary?.start_date && summary?.end_date) {
      const s = parseDate(String(summary.start_date).slice(0, 10));
      const e = parseDate(String(summary.end_date).slice(0, 10));
      if (s && e) {
        s.setHours(0, 0, 0, 0);
        e.setHours(0, 0, 0, 0);
        return { rangeStart: s, rangeEnd: e, anchor: s };
      }
    }
    return {
      rangeStart: chartRangeStart,
      rangeEnd: chartRangeEnd,
      anchor: anchorDate,
    };
  }, [
    effectiveDemoMode,
    useCustomDates,
    selectedPeriod,
    summary?.start_date,
    summary?.end_date,
    chartRangeStart,
    chartRangeEnd,
    anchorDate,
  ]);

  const chartDataForDisplay = useMemo(() => {
    if (effectiveDemoMode) {
      return demoSummaryData?.chart_data || getDemoSummary().chart_data;
    }
    const raw = summary?.chart_data || [];
    const g = summary?.chart_axis_granularity ?? 'day';
    const rs = financeChartViewport.rangeStart;
    const re = financeChartViewport.rangeEnd;
    if (g === 'day' && rs && re) {
      return densifyChartData(raw, rs, re);
    }
    return raw;
  }, [
    effectiveDemoMode,
    demoSummaryData,
    summary?.chart_data,
    summary?.chart_axis_granularity,
    financeChartViewport.rangeStart,
    financeChartViewport.rangeEnd,
  ]);

  /** Для длинного custom range — гранулярность графика (сводка по-прежнему с тем же API). */
  const customRangeDayCount = useMemo(() => {
    if (!useCustomDates || !startDate || !endDate) return null;
    const rs = parseLocalDate(startDate);
    const re = parseLocalDate(endDate);
    rs.setHours(0, 0, 0, 0);
    re.setHours(0, 0, 0, 0);
    if (rs.getTime() > re.getTime()) return null;
    return differenceInDays(re, rs) + 1;
  }, [useCustomDates, startDate, endDate]);

  const chartBucketPeriod = useMemo((): AccountingPeriod => {
    if (customRangeDayCount != null) {
      if (customRangeDayCount > 62) return 'month';
      if (customRangeDayCount > 31) return 'week';
      if (selectedPeriod === 'quarter' || selectedPeriod === 'year') return 'month';
      return selectedPeriod;
    }
    return selectedPeriod;
  }, [customRangeDayCount, selectedPeriod]);

  /** Ось bucketize на native: по шагу данных из API, иначе legacy chartBucketPeriod */
  const nativeChartBucketPeriod = useMemo((): 'day' | 'week' | 'month' | 'quarter' | 'year' => {
    const g = effectiveSummary?.chart_axis_granularity;
    if (g === 'day') return 'day';
    if (g === 'week') return 'week';
    if (g === 'month') {
      if (selectedPeriod === 'quarter') return 'quarter';
      if (selectedPeriod === 'year') return 'year';
      return 'month';
    }
    return chartBucketPeriod;
  }, [effectiveSummary?.chart_axis_granularity, chartBucketPeriod, selectedPeriod]);

  // Diagnostic logging
  useEffect(() => {
    if (__DEV__) {
      const rangeDays = chartRangeStart && chartRangeEnd
        ? differenceInDays(chartRangeEnd, chartRangeStart) + 1
        : 'N/A';
      console.log('[FINANCE DIAG] Range computation:', {
        selectedPeriod,
        chartBucketPeriod,
        timeOffset,
        dayAnchorDate,
        useCustomDates,
        startDate,
        endDate,
        anchorDate: anchorDate ? toISODate(anchorDate) : 'null',
        chartRangeStart: chartRangeStart ? toISODate(chartRangeStart) : 'null',
        chartRangeEnd: chartRangeEnd ? toISODate(chartRangeEnd) : 'null',
        rangeDays,
      });
    }
  }, [
    selectedPeriod,
    chartBucketPeriod,
    timeOffset,
    dayAnchorDate,
    useCustomDates,
    startDate,
    endDate,
    anchorDate,
    chartRangeStart,
    chartRangeEnd,
  ]);
  const selectedSortLabel =
    SORT_OPTIONS.find((option) => option.field === sortField && option.order === sortOrder)?.label ||
    'Сортировка';
  const periodNavLabel = useMemo(
    () => getFinancePeriodLabel(selectedPeriod, timeOffset, dayAnchorDate),
    [selectedPeriod, timeOffset, dayAnchorDate]
  );
  const measuredTabBarHeight = tabBarHeight ?? BOTTOM_NAV_CONTENT_FALLBACK_HEIGHT;
  const floatingBarBottom = Math.max(insets.bottom, 0) + measuredTabBarHeight + FLOATING_BAR_GAP;
  const scrollViewPaddingBottom =
    FLOATING_BAR_HEIGHT + Math.max(insets.bottom, 0) + measuredTabBarHeight + FLOATING_BAR_GAP;

  if (featuresLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={FINANCE_THEME.primaryGreen} />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollViewPaddingBottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        directionalLockEnabled={Platform.OS === 'ios'}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Финансы</Text>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[styles.headerButtonBase, styles.headerButtonPrimary]}
                onPress={() => {
                  if (!hasFinanceAccess) {
                    router.push('/subscriptions');
                    return;
                  }
                  setEditingExpense(null);
                  setEditingExpenseId(null);
                  setIsExpenseModalOpen(true);
                }}
              >
                <Text
                  style={[styles.headerButtonTextBase, styles.headerButtonTextPrimary]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  allowFontScaling={false}
                >
                  + Расход
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerButtonBase, styles.headerButtonSecondary]}
                onPress={() => setIsTaxModalOpen(true)}
              >
                <Text
                  style={[styles.headerButtonTextBase, styles.headerButtonTextSecondary]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  allowFontScaling={false}
                >
                  {taxLoading
                    ? 'Налог …'
                    : `Налог ${currentTaxRate?.has_rate === true ? currentTaxRate?.rate ?? 0 : 0}%`}
                </Text>
                <Ionicons name="create-outline" size={16} color={FINANCE_THEME.primaryGreen} style={styles.headerButtonIcon} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.content}>
        <Card style={styles.card}>
          <View style={styles.financePeriodTabsWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.financePeriodTabsRow}>
              {PERIOD_OPTIONS.map((option) => {
                const active = selectedPeriod === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.financePeriodTab, active && styles.financePeriodTabActive]}
                    onPress={() => handlePeriodChange(option.value)}
                  >
                    <Text style={[styles.financePeriodTabText, active && styles.financePeriodTabTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.financePeriodToolbar}>
            <TouchableOpacity
              style={[styles.financePeriodNavBtn, useCustomDates && styles.offsetButtonDisabled]}
              onPress={() => {
                if (selectedPeriod === 'day') {
                  const d = parseLocalDate(dayAnchorDate);
                  d.setDate(d.getDate() - 1);
                  setDayAnchorDate(formatYmd(d));
                } else {
                  setTimeOffset((prev) => prev - 1);
                }
              }}
              disabled={useCustomDates}
            >
              <Ionicons name="chevron-back" size={20} color={useCustomDates ? '#ccc' : '#333'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.financePeriodCurrentBtn, useCustomDates && styles.offsetButtonDisabled]}
              onPress={() => {
                if (selectedPeriod === 'day') {
                  setDayAnchorDate(new Date().toISOString().slice(0, 10));
                } else {
                  setTimeOffset(0);
                }
              }}
              disabled={useCustomDates}
            >
              <Text style={styles.financePeriodCurrentText}>{periodNavLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.financePeriodNavBtn, useCustomDates && styles.offsetButtonDisabled]}
              onPress={() => {
                if (selectedPeriod === 'day') {
                  const d = parseLocalDate(dayAnchorDate);
                  d.setDate(d.getDate() + 1);
                  setDayAnchorDate(formatYmd(d));
                } else {
                  setTimeOffset((prev) => prev + 1);
                }
              }}
              disabled={useCustomDates}
            >
              <Ionicons name="chevron-forward" size={20} color={useCustomDates ? '#ccc' : '#333'} />
            </TouchableOpacity>
          </View>

          <View style={styles.dateRangeRow}>
            <View style={styles.customDatesGrid}>
              <TouchableOpacity
                style={styles.dateButtonCompact}
                onPress={() => openFinanceDatePicker('start')}
                accessibilityRole="button"
                accessibilityLabel="Дата начала периода"
              >
                <Text style={styles.dateButtonLabel}>Дата начала</Text>
                <Text style={styles.dateButtonValue} numberOfLines={1}>
                  {startDate ? ymdToDdMmYyyy(startDate) : FINANCE_DATE_PLACEHOLDER}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateButtonCompact}
                onPress={() => openFinanceDatePicker('end')}
                accessibilityRole="button"
                accessibilityLabel="Дата окончания периода"
              >
                <Text style={styles.dateButtonLabel}>Дата окончания</Text>
                <Text style={styles.dateButtonValue} numberOfLines={1}>
                  {endDate ? ymdToDdMmYyyy(endDate) : FINANCE_DATE_PLACEHOLDER}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => {
                setStartDate('');
                setEndDate('');
                closeFinanceDateModal();
                setUseCustomDates(false);
              }}
              style={styles.dateRangeClear}
              accessibilityRole="button"
              accessibilityLabel="Сбросить выбранные даты"
            >
              <Ionicons name="close" size={22} color="#666" />
            </TouchableOpacity>
          </View>
          {dateRangeError ? (
            <Text style={styles.dateRangeError}>{dateRangeError}</Text>
          ) : null}

          <Modal
            visible={financeDateModalOpen}
            transparent
            animationType="fade"
            onRequestClose={closeFinanceDateModal}
          >
            <View style={styles.dateModalBackdrop}>
              <Pressable
                style={StyleSheet.absoluteFillObject}
                onPress={closeFinanceDateModal}
                accessibilityLabel="Закрыть выбор даты"
              />
              <View style={styles.dateModalSheet}>
                <Text style={styles.dateModalTitle}>
                  {financeDateStep === 'start'
                    ? 'Выберите дату начала'
                    : 'Выберите дату окончания'}
                </Text>
                <DateTimePicker
                  key={`${financeDateStep}-${String(financeDateModalOpen)}`}
                  value={
                    financeDateStep === 'start'
                      ? startDate
                        ? parseLocalDate(startDate)
                        : new Date()
                      : endDate
                        ? parseLocalDate(endDate)
                        : startDate
                          ? parseLocalDate(startDate)
                          : new Date()
                  }
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                  maximumDate={
                    financeDateStep === 'start' && endDate ? parseLocalDate(endDate) : undefined
                  }
                  minimumDate={
                    financeDateStep === 'end' && startDate ? parseLocalDate(startDate) : undefined
                  }
                  onChange={handleFinanceDatePicked}
                />
                {Platform.OS === 'ios' ? (
                  <TouchableOpacity style={styles.dateModalDone} onPress={closeFinanceDateModal}>
                    <Text style={styles.dateModalDoneText}>Закрыть</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </Modal>
        </Card>

        {showEmptyCard && !effectiveDemoMode && (
          <View style={styles.emptyHint}>
            {useCustomDates && (
              <TouchableOpacity
                style={styles.headerGhostButton}
                onPress={() => {
                  setStartDate('');
                  setEndDate('');
                  setUseCustomDates(false);
                }}
              >
                <Text style={styles.headerGhostText}>Сбросить даты</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!hasFinanceAccess && (
          <DemoAccessBanner
            description={cheapestPlanName ? `Раздел «Финансы» доступен в тарифе ${cheapestPlanName}.` : 'Раздел «Финансы» доступен в подписке.'}
            ctaText="Перейти к тарифам"
            onCtaPress={() => router.push('/subscriptions')}
          />
        )}

        <Card style={styles.card}>
          <SectionHeader title="Сводка" showDemo={effectiveDemoMode} />
          {summaryLoading && !effectiveDemoMode ? (
            <View style={styles.skeletonRow}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={styles.skeletonCard} />
              ))}
            </View>
          ) : summaryError && !effectiveDemoMode ? (
            <Text style={styles.neutralText}>{summaryError}</Text>
          ) : effectiveSummary ? (
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Подтвержденные доходы</Text>
                <Text style={[styles.summaryValue, styles.summaryIncome]}>
                  {showPlaceholders ? '—' : formatMoney2(effectiveSummary.total_income)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Ожидаемые доходы</Text>
                <Text style={[styles.summaryValue, styles.summaryExpected]}>
                  {showPlaceholders ? '—' : formatMoney2(effectiveSummary.total_expected_income)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Расходы</Text>
                <Text style={[styles.summaryValue, styles.summaryExpense]}>
                  {showPlaceholders ? '—' : formatMoney2(effectiveSummary.total_expense)}
                </Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Общая прибыль</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    effectiveSummary.net_profit >= 0 ? styles.summaryProfit : styles.summaryLoss,
                  ]}
                >
                  {showPlaceholders ? '—' : formatMoney2(effectiveSummary.net_profit)}
                </Text>
              </View>
              {!showPlaceholders && effectiveSummary.total_points_spent > 0 && (
                <Text style={styles.pointsSpentText}>
                  Списано баллов: {formatMoney2(effectiveSummary.total_points_spent)}
                </Text>
              )}
            </View>
          ) : (
            <Text style={styles.neutralText}>Данные не загружены</Text>
          )}
        </Card>

        <Card style={styles.card}>
          <SectionHeader title="Доходы и расходы" showDemo={effectiveDemoMode} />
          {summaryLoading && !effectiveDemoMode ? (
            <View style={styles.chartPlaceholder} />
          ) : summaryError && !effectiveDemoMode ? (
            <Text style={styles.neutralText}>{summaryError}</Text>
          ) : chartDataForDisplay.length > 0 ? (
            <TripleLineChart
              title="" 
              data={chartDataForDisplay} 
              period={nativeChartBucketPeriod}
              rangeStart={financeChartViewport.rangeStart}
              rangeEnd={financeChartViewport.rangeEnd}
              anchorDate={financeChartViewport.anchor}
            />
          ) : showPlaceholders ? (
            <Text style={styles.neutralText}>Графики появятся после первых операций</Text>
          ) : (
            <View style={styles.compactEmpty} />
          )}
        </Card>

        <Card style={styles.card}>
          {summaryLoading && !effectiveDemoMode ? (
            <View style={styles.chartPlaceholder} />
          ) : summaryError && !effectiveDemoMode ? (
            <Text style={styles.neutralText}>{summaryError}</Text>
          ) : chartDataForDisplay.length > 0 ? (
            <>
              <SectionHeader title="Общая прибыль" showDemo={effectiveDemoMode} />
              <NetProfitChart 
                data={chartDataForDisplay} 
                period={nativeChartBucketPeriod}
                rangeStart={financeChartViewport.rangeStart}
                rangeEnd={financeChartViewport.rangeEnd}
                anchorDate={financeChartViewport.anchor}
              />
            </>
          ) : showPlaceholders ? (
            <Text style={styles.neutralText}>График появится после первых операций</Text>
          ) : (
            <View style={styles.compactEmpty} />
          )}
        </Card>

        <Card style={styles.card}>
          <View style={styles.operationsHeader}>
            <SectionHeader title="Операции" showDemo={effectiveDemoMode} />
            {SHOW_EXPORT && (
              <View style={styles.exportButtons}>
                <TouchableOpacity
                  style={[
                    styles.exportButton,
                    (exporting || effectiveDemoMode) && styles.exportButtonDisabled,
                  ]}
                  onPress={() => handleExport('csv')}
                  disabled={exporting || effectiveDemoMode}
                >
                  <Text style={styles.exportButtonText}>
                    {exporting ? 'Экспорт…' : 'Экспорт CSV'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.exportButton,
                    (exporting || effectiveDemoMode) && styles.exportButtonDisabled,
                  ]}
                  onPress={() => handleExport('excel')}
                  disabled={exporting || effectiveDemoMode}
                >
                  <Text style={styles.exportButtonText}>
                    {exporting ? 'Экспорт…' : 'Экспорт Excel'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.filtersAndSortRow}>
            <View style={styles.filtersRow}>
              {(['all', 'income', 'expense'] as const).map((t) => {
                const active = operationTypeFilter === t;
                const label = t === 'all' ? 'Все' : t === 'income' ? 'Доходы' : 'Расходы';
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setOperationTypeFilter(t)}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={[styles.dropdownWrapper, styles.sortDropdownInRow]}>
              <TouchableOpacity
                style={[styles.dropdownButtonSmall, styles.dropdownButtonInFiltersRow]}
                onPress={() => setIsSortOpen((prev) => !prev)}
              >
                <View style={styles.dropdownLabelRow}>
                  <Text style={styles.dropdownText} numberOfLines={1}>
                    {selectedSortLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#666" />
                </View>
              </TouchableOpacity>
              {isSortOpen && (
                <View style={styles.dropdownMenu}>
                  {SORT_OPTIONS.map((option) => {
                    const active = sortField === option.field && sortOrder === option.order;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.dropdownItem, active && styles.dropdownItemActive]}
                        onPress={() => {
                          setIsSortOpen(false);
                          setSortField(option.field as typeof sortField);
                          setSortOrder(option.order as typeof sortOrder);
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            active && styles.dropdownItemTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
          <Text style={styles.sortHint}>Сортировка применяется только к текущей странице</Text>

          {operationsLoading && !effectiveDemoMode ? (
            <View style={styles.operationsLoading}>
              <ActivityIndicator size="small" color={FINANCE_THEME.primaryGreen} />
              <Text style={styles.loadingTextSmall}>Загрузка операций…</Text>
            </View>
          ) : operationsError && !effectiveDemoMode ? (
            <Text style={styles.neutralText}>{operationsError}</Text>
          ) : !effectiveDemoMode && showPlaceholders ? (
            <>
              <Text style={styles.neutralText}>Операций пока нет</Text>
              <Text style={styles.operationsHint}>
                Фильтры и сортировка будут доступны после появления операций
              </Text>
            </>
          ) : (
            <View style={styles.operationsList}>
              {effectiveOperations.map((operation) => {
                const isIncome = operation.operation_type === 'income';
                const isExpense = operation.operation_type === 'expense';
                const parsedExpenseId = isExpense ? parseExpenseId(operation.id) : null;
                const name = operation.name || (isIncome ? 'Доход' : 'Расход');
                const grossAmount = Math.abs(Number(operation.gross_amount ?? operation.amount) || 0);
                const taxRate = isIncome ? Number(operation.tax_rate ?? 0) : 0;
                const apiTaxAmount = isIncome ? Number(operation.tax_amount ?? NaN) : NaN;
                const apiNetAmount = isIncome ? Number(operation.net_amount ?? NaN) : NaN;
                // real-path safeguard: prefer API values when available
                const fallbackTaxAmount = grossAmount * (taxRate / 100);
                const taxAmount =
                  !effectiveDemoMode && Number.isFinite(apiTaxAmount) ? apiTaxAmount : fallbackTaxAmount;
                const netAmount = isIncome
                  ? !effectiveDemoMode && Number.isFinite(apiNetAmount)
                    ? apiNetAmount
                    : grossAmount - taxAmount
                  : -Math.abs(Number(operation.amount) || 0);
                const metaParts = [formatFinanceDateDdMmYyyy(operation.date)];
                return (
                  <View key={operation.id} style={styles.operationCard}>
                    <View style={styles.operationTopRow}>
                      <Text style={styles.operationName}>{name}</Text>
                      <Text style={[styles.operationSum, isIncome ? styles.operationIncomeSum : styles.operationExpenseSum]}>
                        {isIncome ? '+' : '-'}{formatMoney2(grossAmount)}
                      </Text>
                    </View>
                    <Text style={styles.operationMetaText}>{metaParts.join(' · ')}</Text>
                    {isIncome && (
                      <View style={styles.operationSubRow}>
                        <Text style={styles.operationSubText}>
                          Налог: {taxRate ? `${taxRate}%` : '—'}{taxRate ? ` · ${formatMoney2(taxAmount)}` : ''}
                        </Text>
                        <Text style={styles.operationSubText}>Чистая: {formatMoney2(netAmount)}</Text>
                      </View>
                    )}
                    {isExpense && parsedExpenseId && !effectiveDemoMode ? (
                      <View style={styles.operationActions}>
                        <TouchableOpacity
                          onPress={() => {
                            setEditingExpense(operation);
                            setEditingExpenseId(parsedExpenseId);
                            setIsExpenseModalOpen(true);
                          }}
                        >
                          <Text style={styles.operationActionEdit}>Редактировать</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteExpense(operation)}>
                          <Text style={styles.operationActionDelete}>Удалить</Text>
                        </TouchableOpacity>
                      </View>
                    ) : effectiveDemoMode ? (
                      <Text style={styles.operationActionDisabled}>Демо-режим</Text>
                    ) : (
                      <Text style={styles.operationActionDisabled}>Только просмотр</Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {totalPages > 1 && (
            <View style={styles.paginationRow}>
              <TouchableOpacity
                onPress={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
              >
                <View style={styles.paginationButtonInner}>
                  <Ionicons
                    name="chevron-back"
                    size={18}
                    color={currentPage === 1 ? '#ccc' : FINANCE_THEME.primaryGreen}
                  />
                  <Text style={styles.paginationButtonText}>Назад</Text>
                </View>
              </TouchableOpacity>
              <Text style={styles.paginationText}>Страница {currentPage} из {totalPages}</Text>
              <TouchableOpacity
                onPress={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                style={[styles.paginationButton, currentPage === totalPages && styles.paginationButtonDisabled]}
              >
                <View style={styles.paginationButtonInner}>
                  <Text style={styles.paginationButtonText}>Вперед</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={currentPage === totalPages ? '#ccc' : FINANCE_THEME.primaryGreen}
                  />
                </View>
              </TouchableOpacity>
            </View>
          )}
        </Card>
      </View>
      </ScrollView>
      {effectiveDemoMode && (
        <View style={[styles.demoFloatingBar, { bottom: floatingBarBottom, height: FLOATING_BAR_HEIGHT }]}>
          <Text style={styles.demoFloatingText}>Показан пример данных</Text>
          {hasFinanceAccess ? (
            <TouchableOpacity
              style={styles.demoFloatingGhost}
              onPress={() => setDemoDismissed(true)}
            >
              <Text style={styles.demoFloatingGhostText}>Скрыть пример</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.demoFloatingPrimary}
              onPress={() => router.push('/subscriptions')}
            >
              <Text style={styles.demoFloatingPrimaryText}>Перейти к тарифам</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <TaxRateModal
        visible={isTaxModalOpen}
        onClose={() => setIsTaxModalOpen(false)}
        currentRate={currentTaxRate}
        onSuccess={() => {
          loadCurrentTaxRate();
          loadSummary();
          loadOperations();
        }}
      />
      <ExpenseModal
        visible={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        expense={editingExpense}
        expenseId={editingExpenseId}
        onSuccess={() => {
          loadSummary();
          loadOperations();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 16,
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
  loadingTextSmall: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e6e6e6',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  headerButtonBase: {
    minWidth: 124,
    maxWidth: 170,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  headerButtonPrimary: {
    backgroundColor: FINANCE_THEME.primaryGreen,
  },
  headerButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  headerButtonTextBase: {
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
    paddingRight: 14,
    flex: 0,
    flexShrink: 0,
  },
  headerButtonTextPrimary: {
    color: '#fff',
  },
  headerButtonTextSecondary: {
    color: '#333',
  },
  headerButtonIcon: {
    position: 'absolute',
    right: 12,
  },
  headerGhostButton: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  headerGhostText: {
    fontSize: 12,
    color: '#333',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  addExpenseButton: {
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    opacity: 0.6,
  },
  addExpenseButtonText: {
    fontSize: 12,
    color: '#666',
  },
  content: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    color: '#333',
    includeFontPadding: false,
    flex: 1,
    flexShrink: 1,
    marginRight: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  demoBadge: {
    marginTop: 0,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: FINANCE_THEME.mutedGreenBg,
    flexShrink: 0,
  },
  demoBadgeText: {
    fontSize: 13,
    lineHeight: 18,
    includeFontPadding: false,
    color: FINANCE_THEME.primaryGreen,
    fontWeight: '600',
  },
  operationsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  exportButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  exportButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: 'transparent',
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    fontSize: 11,
    color: '#333',
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  financePeriodTabsWrap: {
    borderRadius: 12,
    backgroundColor: '#F7F8FA',
    borderWidth: 1,
    borderColor: '#EEF0F2',
    paddingVertical: 6,
    paddingHorizontal: 6,
    marginBottom: 10,
  },
  financePeriodTabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  financePeriodTab: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  financePeriodTabActive: {
    backgroundColor: FINANCE_THEME.primaryGreen,
    borderColor: FINANCE_THEME.primaryGreen,
  },
  financePeriodTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475467',
  },
  financePeriodTabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  financePeriodToolbar: {
    borderWidth: 1,
    borderColor: '#E7EAEE',
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  financePeriodNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  financePeriodCurrentBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    backgroundColor: FINANCE_THEME.periodSurfaceBg,
  },
  financePeriodCurrentText: {
    fontSize: 14,
    fontWeight: '700',
    color: FINANCE_THEME.primaryGreen,
  },
  dropdownWrapper: {
    position: 'relative',
  },
  dropdownWrapperFixed: {
    width: 140,
  },
  dropdownButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownButtonSmall: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  dropdownButtonInFiltersRow: {
    alignSelf: 'stretch',
    width: '100%',
  },
  dropdownDisabled: {
    opacity: 0.5,
  },
  dropdownText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
  },
  dropdownTextDisabled: {
    color: '#999',
  },
  dropdownLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dropdownMenu: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownItemActive: {
    backgroundColor: '#F4F9F4',
  },
  dropdownItemText: {
    fontSize: 12,
    color: '#333',
  },
  dropdownItemTextActive: {
    color: FINANCE_THEME.primaryGreen,
    fontWeight: '600',
  },
  offsetRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offsetIconButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  offsetTodayButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F4F4F4',
  },
  offsetTodayText: {
    fontSize: 12,
    color: '#333',
  },
  segmentRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  segmentButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  segmentButtonActive: {
    backgroundColor: FINANCE_THEME.primaryGreen,
    borderColor: FINANCE_THEME.primaryGreen,
  },
  segmentButtonDisabled: {
    opacity: 0.5,
  },
  segmentButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  segmentButtonTextActive: {
    color: '#fff',
  },
  segmentButtonTextDisabled: {
    color: '#999',
  },
  offsetRowCompact: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  offsetButtonCompact: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  offsetButtonDisabled: {
    opacity: 0.5,
  },
  offsetButtonText: {
    fontSize: 12,
    color: '#333',
  },
  customDatesGrid: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
    minWidth: 0,
  },
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateRangeClear: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#F7F7F7',
  },
  dateButtonCompact: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  dateButtonLabel: {
    fontSize: 11,
    color: '#777',
  },
  dateButtonValue: {
    fontSize: 12,
    color: '#333',
    marginTop: 2,
  },
  clearButtonCompact: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#F5F5F5',
  },
  dateRangeError: {
    marginTop: 6,
    fontSize: 11,
    color: '#666',
  },
  dateModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  dateModalSheet: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  dateModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
    marginBottom: 10,
    textAlign: 'center',
  },
  dateModalDone: {
    marginTop: 12,
    alignSelf: 'stretch',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: FINANCE_THEME.primaryGreen,
    alignItems: 'center',
  },
  dateModalDoneText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '48%',
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#F9F9F9',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#777',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  summaryIncome: {
    color: FINANCE_THEME.primaryGreen,
  },
  summaryExpected: {
    color: FINANCE_THEME.lightGreen,
  },
  summaryExpense: {
    color: FINANCE_THEME.lossRed,
  },
  summaryProfit: {
    color: FINANCE_THEME.primaryGreen,
  },
  summaryLoss: {
    color: FINANCE_THEME.lossRed,
  },
  pointsSpentText: {
    marginTop: 8,
    fontSize: 12,
    color: '#F57C00',
  },
  skeletonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  skeletonCard: {
    height: 64,
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    flexBasis: '48%',
  },
  chartPlaceholder: {
    height: 140,
    backgroundColor: '#F9F9F9',
    borderRadius: 10,
  },
  compactEmpty: {
    height: 16,
  },
  emptyHint: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  demoFloatingBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: FINANCE_THEME.primaryGreen,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  demoFloatingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  demoFloatingBadge: {
    fontSize: 12,
    color: FINANCE_THEME.primaryGreen,
    backgroundColor: FINANCE_THEME.mutedGreenBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
    fontWeight: '600',
  },
  demoFloatingText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500',
  },
  demoFloatingGhost: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fff',
    backgroundColor: 'transparent',
  },
  demoFloatingGhostText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  demoFloatingPrimary: {
    backgroundColor: FINANCE_THEME.primaryGreen,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  demoFloatingPrimaryText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600',
  },
  upgradeCard: {
    paddingVertical: 14,
  },
  upgradeText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 10,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  chartBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 0,
    paddingBottom: 8,
    position: 'relative',
  },
  chartHitBox: {
    backgroundColor: 'transparent',
  },
  chartColumn: {
    alignItems: 'center',
  },
  chartBarsGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 0,
  },
  chartBar: {
    borderRadius: 6,
  },
  chartLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 6,
  },
  chartLegend: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 10,
    color: '#666',
  },
  chartTooltip: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F7F7F7',
  },
  chartTooltipTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  chartTooltipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  chartTooltipLabel: {
    fontSize: 11,
    color: '#666',
  },
  chartTooltipValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
  },
  netChart: {
    paddingBottom: 6,
  },
  netPlotArea: {
    height: 150,
    position: 'relative',
    paddingTop: 8,
  },
  netHitZone: {
    position: 'absolute',
    top: 0,
    bottom: 20,
  },
  netLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: FINANCE_THEME.primaryGreen,
  },
  netDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: FINANCE_THEME.primaryGreen,
  },
  netLabel: {
    position: 'absolute',
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  netLabelText: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
    alignItems: 'center',
  },
  filtersAndSortRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'nowrap',
  },
  sortDropdownInRow: {
    flex: 1,
    minWidth: 0,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F4F4F4',
  },
  filterChipActive: {
    backgroundColor: FINANCE_THEME.primaryGreen,
  },
  filterChipText: {
    fontSize: 12,
    color: '#666',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  sortRow: {
    marginTop: 0,
    marginBottom: 0,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
  },
  sortChipActive: {
    backgroundColor: FINANCE_THEME.primaryGreen,
  },
  sortChipText: {
    fontSize: 11,
    color: '#666',
  },
  sortChipTextActive: {
    color: '#fff',
  },
  sortHint: {
    fontSize: 9,
    color: '#999',
    marginTop: 2,
    marginBottom: 8,
    lineHeight: 12,
  },
  operationsLoading: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  operationsHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#999',
  },
  operationsList: {
    gap: 4,
  },
  operationCard: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  operationTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  operationName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    lineHeight: 16,
  },
  operationSum: {
    fontSize: 12,
    fontWeight: '700',
  },
  operationIncomeSum: {
    color: FINANCE_THEME.primaryGreen,
  },
  operationExpenseSum: {
    color: FINANCE_THEME.lossRed,
  },
  operationMetaText: {
    marginTop: 2,
    fontSize: 10,
    color: '#666',
    lineHeight: 14,
  },
  operationSubRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  operationSubText: {
    fontSize: 10,
    color: '#666',
    lineHeight: 13,
  },
  operationActions: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 10,
  },
  operationActionEdit: {
    fontSize: 11,
    color: FINANCE_THEME.primaryGreen,
  },
  operationActionDelete: {
    fontSize: 11,
    color: FINANCE_THEME.lossRed,
  },
  operationActionDisabled: {
    marginTop: 8,
    fontSize: 11,
    color: '#999',
  },
  operationAmountValue: {
    fontSize: 13,
    fontWeight: '600',
    color: FINANCE_THEME.primaryGreen,
  },
  operationAmountExpense: {
    color: FINANCE_THEME.lossRed,
  },
  operationAmountSecondary: {
    fontSize: 12,
    color: '#666',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  paginationButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  paginationButtonDisabled: {
    opacity: 0.5,
  },
  paginationButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paginationButtonText: {
    fontSize: 12,
    color: '#333',
  },
  paginationText: {
    fontSize: 12,
    color: '#666',
  },
  neutralText: {
    fontSize: 13,
    color: '#666',
  },
  lockedCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  lockedIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  lockedTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
    color: '#333',
  },
  lockedText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  lockedButton: {
    alignSelf: 'stretch',
  },
});
