import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BanknotesIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  Cog6ToothIcon,
  InformationCircleIcon,
  PresentationChartLineIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import NotePopover from './ui/NotePopover';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { apiGet, apiPost } from '../utils/api';
import { canCancelBooking, canPreVisitConfirmBooking, canConfirmPostVisit, CANCELLATION_REASONS } from '../utils/bookingOutcome';
import AllBookingsModal from './AllBookingsModal';
import MasterBookingCardMobile from './master/mobile/MasterBookingCardMobile';
import MasterBookingDetailSheet from './master/mobile/MasterBookingDetailSheet';
import MasterBookingCancelSheet from './master/mobile/MasterBookingCancelSheet';
import { getPlanDisplayName } from '../utils/subscriptionPlanNames';
import { formatMoney } from '../utils/formatMoney';
import { formatDateShort, formatTimeShort } from '../utils/dateFormat';
import { getStatusBadgeForPast } from '../utils/bookingStatusDisplay';
import { useToast } from '../contexts/ToastContext';
import {
  formatStatsBucketRange,
  formatStatsAxisLabel,
  normalizeLegacyPeriodLabel,
} from 'shared/statsPeriodLabels';
import { masterZClass } from '../config/masterOverlayZIndex';
import { MASTER_STATS_CHANGE_LINE_DOT, MASTER_STATS_CHANGE_LINE_STROKE } from '../utils/masterStatsChartTheme';

// Используем централизованную утилиту для названий планов
const getPlanNameInRussian = (planName) => {
  return getPlanDisplayName(planName);
};

const getBookingNoteKey = (b) => `${b?.id ?? ''}-${(b?.start_time ?? b?.date ?? '')}-${b?.client_phone ?? ''}`;

function stripIndiePrefix(name) {
  if (!name || typeof name !== 'string') return name || '';
  return name.replace(/^(Инди|Indie):\s*/i, '').trim();
}

/** Цвета сегментов stacked bar: прошлое — серые, текущий — зелёный + синий, будущее — голубые */
function stackSegmentFills(entry) {
  if (entry.is_past) {
    return { confirmed: '#757575', pending: '#BDBDBD' };
  }
  if (entry.is_current) {
    return { confirmed: '#4CAF50', pending: '#64B5F6' };
  }
  return { confirmed: '#42A5F5', pending: '#90CAF9' };
}

/** Future: pending = awaiting confirmation (created); confirmed = accepted by master */
function isFuturePending(status) {
  const s = String(status || '').toLowerCase();
  return s === 'created' || s === 'awaiting_confirmation';
}

/** Future: cancelled — показываем в группе «Отменено», без кнопок действий */
function isFutureCancelled(status) {
  const s = String(status || '').toLowerCase();
  return s === 'cancelled' || s === 'cancelled_by_client_early' || s === 'cancelled_by_client_late';
}

function futureStatusPill(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'confirmed') {
    return { label: 'Подтверждено', className: 'bg-[#DFF5EC] text-[#3D8B42]' };
  }
  if (s === 'created' || s === 'awaiting_confirmation') {
    return { label: 'Ожидает', className: 'bg-[#FEF7E6] text-[#B45309]' };
  }
  return { label: '—', className: 'bg-[#F4F1EF] text-[#A0A0A0]' };
}

function isBookingStartTodayLocal(startTimeIso) {
  if (!startTimeIso) return false;
  const d = new Date(startTimeIso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function buildEligibleFutureDashboardList(nextList) {
  if (!Array.isArray(nextList)) return [];
  const list = nextList.map((b) => ({
    ...b,
    start_time: b.start_time || (b.date && b.time ? `${b.date}T${b.time}:00` : null),
  }));
  return list
    .filter((b) => !isFutureCancelled(b.status))
    .filter((b) => {
      const s = String(b.status || '').toLowerCase();
      return s === 'awaiting_confirmation' || s === 'confirmed' || s === 'created';
    })
    .sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0))
    .slice(0, 3);
}

export default function MasterDashboardStats({
  refreshTrigger = 0,
  dashboardOverlayResetKey = 0,
  settingsPayload = null,
  onNavigateToStats,
  onConfirmSuccess,
  subscriptionStatus,
  balance = null,
  hasExtendedStats = false,
  onOpenSubscriptionModal,
  onOpenSchedule,
  onOpenServices,
  onOpenTariff,
  onOpenSettings,
}) {
  const { showToast } = useToast();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookingsLimit, setBookingsLimit] = useState(null);
  const [showAllBookingsModal, setShowAllBookingsModal] = useState(false);
  const [allBookingsModalMode, setAllBookingsModalMode] = useState('future');
  const [pastBookings, setPastBookings] = useState([]);
  const [pastBookingsLoading, setPastBookingsLoading] = useState(false);
  const [pastBookingsTotal, setPastBookingsTotal] = useState(0);
  /** Desktop booking hub: отдельные totals/превью из "полных" источников */
  const [desktopFuturePreview, setDesktopFuturePreview] = useState([]);
  const [desktopFutureTotal, setDesktopFutureTotal] = useState(0);
  const [desktopPastPendingPreview, setDesktopPastPendingPreview] = useState([]);
  const [desktopPastPendingTotal, setDesktopPastPendingTotal] = useState(0);
  const [servicesStatsTab, setServicesStatsTab] = useState('bookings'); // 'bookings' или 'earnings'
  const [cancelBookingId, setCancelBookingId] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  /** Для disabled на мобильных карточках во время confirm/cancel (как в AllBookingsModal) */
  const [actionBookingId, setActionBookingId] = useState(null);
  const [masterSettings, setMasterSettings] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [notePopover, setNotePopover] = useState(null);
  // На узком экране графики свёрнуты по умолчанию; на lg+ всегда видны через класс lg:block (без matchMedia).
  const [chartsExpanded, setChartsExpanded] = useState(false);
  /** Mobile: { booking, sectionType } для detail sheet */
  const [mobileBookingDetail, setMobileBookingDetail] = useState(null);
  const chartsAnchorRef = useRef(null);
  /** Только desktop: единая панель «Активность за неделю» (график + список по табам) */
  const [activityChartKind, setActivityChartKind] = useState('bookings');
  const [activityListTab, setActivityListTab] = useState('future');
  /** Отслеживаем lg-брейкпоинт чтобы не монтировать Recharts в display:none контейнерах (иначе warnings про width(0)/height(0)). */
  const [isLg, setIsLg] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)').matches
      : false
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e) => setIsLg(e.matches);
    setIsLg(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, []);
  /** Desktop booking hub: отдельные табы, mobile не трогаем */
  const [desktopBookingTab, setDesktopBookingTab] = useState('future');

  useEffect(() => {
    setShowAllBookingsModal(false);
  }, [dashboardOverlayResetKey]);

  useEffect(() => {
    if (!chartsExpanded) return undefined;
    const t = window.setTimeout(() => {
      chartsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => window.clearTimeout(t);
  }, [chartsExpanded]);

  const handleNoteClick = useCallback((booking, e) => {
    e.stopPropagation();
    const key = getBookingNoteKey(booking);
    setNotePopover((prev) => (prev?.key === key ? null : { content: booking.client_note || '', anchorRect: e.currentTarget.getBoundingClientRect(), key }));
  }, []);
  const navigate = useNavigate();

  useEffect(() => {
    if (settingsPayload) {
      setMasterSettings(settingsPayload);
    }
  }, [settingsPayload]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onLg = () => {
      if (mq.matches) setMobileBookingDetail(null);
    };
    mq.addEventListener('change', onLg);
    return () => mq.removeEventListener('change', onLg);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (cancelBookingId) {
        setCancelBookingId(null);
        return;
      }
      if (mobileBookingDetail) {
        setMobileBookingDetail(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelBookingId, mobileBookingDetail]);

  useEffect(() => {
    loadDashboardStats();
    loadBookingsLimit();
    loadPastBookings();
    loadDesktopFutureBookings();
    loadDesktopPastPendingBookings();
    if (!settingsPayload) {
      loadMasterSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, settingsPayload]);

  useEffect(() => {
    // masterSettings могут прийти позже: докачиваем превью «прошедших на подтверждение» уже с валидным master.
    if (!masterSettings?.master) return;
    loadDesktopPastPendingBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterSettings?.master]);

  const loadPastBookings = async () => {
    try {
      setPastBookingsLoading(true);
      const data = await apiGet('/api/master/past-appointments?page=1&limit=3');
      setPastBookings(data.appointments || []);
      setPastBookingsTotal(Number(data?.total) || 0);
    } catch (err) {
      console.error('Ошибка загрузки прошедших записей:', err);
    } finally {
      setPastBookingsLoading(false);
    }
  };

  const loadDesktopFutureBookings = async () => {
    try {
      const data = await apiGet('/api/master/bookings/future?page=1&limit=20');
      const list = Array.isArray(data?.bookings) ? data.bookings : [];
      const normalized = list
        .map((b) => ({
          ...b,
          start_time: b.start_time || (b.date && b.time ? `${b.date}T${b.time}:00` : null),
        }))
        .filter((b) => !!b.start_time)
        .filter((b) => !isFutureCancelled(b.status))
        .sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
      setDesktopFuturePreview(normalized);
      setDesktopFutureTotal(Number(data?.total) || 0);
    } catch (err) {
      // не блокируем экран из-за totals на dashboard
      console.error('Ошибка загрузки будущих записей (desktop totals):', err);
      setDesktopFuturePreview([]);
      setDesktopFutureTotal(0);
    }
  };

  const loadDesktopPastPendingBookings = async () => {
    try {
      // Для post-visit confirmation нам нужны прошлые записи в статусах created/confirmed/awaiting_confirmation.
      // API умеет отдавать total по фильтру status (см. AllBookingsModal).
      const [created, confirmed, awaiting] = await Promise.all([
        apiGet('/api/master/past-appointments?page=1&limit=20&status=created'),
        apiGet('/api/master/past-appointments?page=1&limit=20&status=confirmed'),
        apiGet('/api/master/past-appointments?page=1&limit=20&status=awaiting_confirmation'),
      ]);

      const total =
        (Number(created?.total) || 0) + (Number(confirmed?.total) || 0) + (Number(awaiting?.total) || 0);
      setDesktopPastPendingTotal(total);

      const merge = [
        ...(Array.isArray(created?.appointments) ? created.appointments : []),
        ...(Array.isArray(confirmed?.appointments) ? confirmed.appointments : []),
        ...(Array.isArray(awaiting?.appointments) ? awaiting.appointments : []),
      ];

      const master = masterSettings?.master ?? null;
      const normalized = merge
        .map((b) => ({
          ...b,
          start_time: b.start_time || (b.date && b.time ? `${b.date}T${b.time}:00` : null),
        }))
        .filter((b) => !!b.start_time)
        .filter((b) => canConfirmPostVisit(b, master))
        .sort((a, b) => new Date(b.start_time || 0) - new Date(a.start_time || 0));

      setDesktopPastPendingPreview(normalized);
    } catch (err) {
      console.error('Ошибка загрузки прошедших на подтверждение (desktop totals):', err);
      setDesktopPastPendingPreview([]);
      setDesktopPastPendingTotal(0);
    }
  };

  const loadBookingsLimit = async () => {
    try {
      const data = await apiGet('/api/master/bookings/limit');
      setBookingsLimit(data);
    } catch (err) {
      console.error('Ошибка загрузки лимита записей:', err);
    }
  };

  const handleCancelClick = (booking) => {
    setCancelBookingId(booking.id);
  };

  const loadMasterSettings = async () => {
    try {
      const data = await apiGet('/api/master/settings');
      setMasterSettings(data);
    } catch (err) {
      console.error('Ошибка загрузки настроек мастера:', err);
    }
  };

  const handleConfirmPreVisit = async (bookingId) => {
    try {
      setConfirmLoading(true);
      await apiPost(`/api/master/accounting/update-booking-status/${bookingId}?new_status=confirmed`);
      await loadDashboardStats();
      await loadBookingsLimit();
      showToast('Принято', 'success', { quiet: true });
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Ошибка при принятии записи', 'error');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleConfirmPostVisit = async (bookingId) => {
    try {
      setConfirmLoading(true);
      await apiPost(`/api/master/accounting/confirm-booking/${bookingId}`);
      await loadDashboardStats();
      await loadPastBookings();
      onConfirmSuccess?.();
      showToast('Запись подтверждена', 'success');
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Ошибка при подтверждении записи', 'error');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleCancelWithReason = async (bookingId, reason) => {
    setCancelBookingId(null);
    if (!reason) return;
    try {
      setCancelLoading(true);
      setActionBookingId(bookingId);
      await apiPost(`/api/master/accounting/cancel-booking/${bookingId}?cancellation_reason=${reason}`);
      await loadDashboardStats();
      await loadPastBookings();
      onConfirmSuccess?.();
      showToast('Запись отменена', 'success');
      setMobileBookingDetail(null);
    } catch (err) {
      console.error('Ошибка отмены записи:', err);
      showToast(err?.response?.data?.detail || 'Ошибка при отмене записи', 'error');
    } finally {
      setCancelLoading(false);
      setActionBookingId(null);
    }
  };

  /** Те же guards и ветви API, что в AllBookingsModal.handleConfirm */
  const handleConfirmUnified = async (bookingId, booking) => {
    const master = masterSettings?.master ?? null;
    const b = {
      ...booking,
      start_time: booking.start_time || (booking.date && booking.time ? `${booking.date}T${booking.time}:00` : ''),
    };
    const preVisit = canPreVisitConfirmBooking(b, master, undefined, hasExtendedStats);
    const postVisit = canConfirmPostVisit(b, master);
    if (!preVisit && !postVisit) {
      showToast('Подтверждение для этой записи недоступно', 'error');
      return;
    }
    try {
      setActionBookingId(bookingId);
      if (preVisit) {
        await handleConfirmPreVisit(bookingId);
      } else {
        await handleConfirmPostVisit(bookingId);
      }
    } finally {
      setActionBookingId(null);
      setMobileBookingDetail(null);
    }
  };

  const loadDashboardStats = async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('Необходима авторизация');
        setLoading(false);
        return;
      }
      const url = `/api/master/dashboard/stats?period=week&offset=0`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        localStorage.removeItem('access_token');
        navigate('/login');
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        setError(`Ошибка загрузки статистики: ${response.status}`);
        return;
      }

      if (response.ok) {
        const data = await response.json();
        // Добавляем расчет изменений на фронтенде, если их нет в ответе
        if (data.weeks_data && data.weeks_data.length > 0) {
          const enhancedWeeksData = data.weeks_data.map((item, index) => {
            let bookings_change = 0;
            let income_change = 0;
            
            if (index > 0) {
              const prevItem = data.weeks_data[index - 1];
              const prevB = Number(prevItem.bookings_total ?? prevItem.bookings ?? 0);
              const curB = Number(item.bookings_total ?? item.bookings ?? 0);
              if (prevB > 0) {
                bookings_change = Math.round(((curB - prevB) / prevB) * 100);
              }
              const prevI = Number(prevItem.income_total_rub ?? prevItem.income ?? 0);
              const curI = Number(item.income_total_rub ?? item.income ?? 0);
              if (prevI > 0) {
                income_change = Math.round(((curI - prevI) / prevI) * 100);
              }
            }
            
            return {
              ...item,
              bookings_change,
              income_change
            };
          });
          
          data.weeks_data = enhancedWeeksData;
        }

        setStats(data);
      }
    } catch (err) {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  const eligibleFutureForDashboard = useMemo(
    () => buildEligibleFutureDashboardList(stats?.next_bookings_list),
    [stats?.next_bookings_list]
  );
  /** Desktop hub: future/pending считаем из future endpoint (не из stats.next_bookings_list, который может быть урезан). */
  const desktopFutureAll = useMemo(() => (Array.isArray(desktopFuturePreview) ? desktopFuturePreview : []), [desktopFuturePreview]);
  const desktopFutureTop3 = useMemo(() => desktopFutureAll.slice(0, 3), [desktopFutureAll]);

  /** Desktop «Ожидают»: сначала все прошлые post-visit confirmation, затем будущие pre-visit confirmation. */
  const desktopPendingPastAll = useMemo(
    () => (Array.isArray(desktopPastPendingPreview) ? desktopPastPendingPreview : []),
    [desktopPastPendingPreview]
  );

  const desktopPendingFutureAll = useMemo(() => {
    const master = masterSettings?.master ?? null;
    return desktopFutureAll.filter((b) => canPreVisitConfirmBooking(b, master, undefined, hasExtendedStats));
  }, [desktopFutureAll, masterSettings?.master, hasExtendedStats]);

  const desktopPendingAll = useMemo(
    () => [...desktopPendingPastAll.map((b) => ({ kind: 'past', b })), ...desktopPendingFutureAll.map((b) => ({ kind: 'future', b }))],
    [desktopPendingPastAll, desktopPendingFutureAll]
  );
  const desktopPendingTop3 = useMemo(() => desktopPendingAll.slice(0, 3), [desktopPendingAll]);

  /** Desktop badge totals: считаем полный total, а не top-3. */
  const desktopFutureCount = desktopFutureTotal;
  const desktopPastCount = pastBookingsTotal;
  const desktopPendingCount = desktopPastPendingTotal + desktopPendingFutureAll.length;

  const renderActivityFutureRow = (booking) => {
    const b = { ...booking, start_time: booking.start_time || (booking.date && booking.time ? `${booking.date}T${booking.time}:00` : '') };
    const master = masterSettings?.master ?? null;
    const showPreVisit = canPreVisitConfirmBooking(b, master, undefined, hasExtendedStats);
    const showCancel = canCancelBooking(b);
    const dispName = (booking.client_display_name || booking.client_name || '').trim() || 'Клиент';
    const clientLabel = booking.client_phone ? `${dispName} (${booking.client_phone})` : dispName;
    const timeStr = b.start_time ? (formatTimeShort(b.start_time) || booking.time || '') : (booking.time || '—');
    const st = b.start_time ? new Date(b.start_time) : null;
    const validD = st && !Number.isNaN(st.getTime());
    const wkShort = validD ? st.toLocaleDateString('ru-RU', { weekday: 'short' }).toUpperCase() : '';
    const dateShort = validD
      ? `${st.getDate()} ${st.toLocaleDateString('ru-RU', { month: 'short' })}`
      : '';
    const stPill = futureStatusPill(booking.status);
    const pay = Number(booking.payment_amount);
    const svc = Number(booking.service_price);
    const amountRub = pay > 0 ? pay : (svc > 0 ? svc : 0);
    const dur =
      booking.service_duration && String(booking.service_duration).trim()
        ? String(booking.service_duration).replace(/\s*минут\b/gi, ' мин')
        : null;
    return (
      <div className="group flex w-full min-w-0 items-center gap-3 text-sm sm:gap-4">
        <div className="w-[58px] min-w-[58px] shrink-0 select-none text-center sm:w-[64px] sm:min-w-[64px]">
          <p className="text-[10px] font-semibold leading-none tracking-[0.05em] text-[#A0A0A0]">{wkShort || '—'}</p>
          <p className="mt-1.5 text-base font-bold tabular-nums leading-none text-[#2D2D2D]">{timeStr !== '—' ? timeStr : '—'}</p>
          <p className="mt-1.5 text-[10px] leading-tight text-[#A0A0A0]">{dateShort || '—'}</p>
        </div>
        <div className="min-w-0 flex-1 pl-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-[13px] font-medium text-[#2D2D2D]">{booking.service_name}</p>
            {dur ? (
              <span className="shrink-0 rounded bg-[#F4F1EF] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[#6B6B6B]">
                {dur}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-[#6B6B6B]">
            <span className="break-words">{clientLabel}</span>
            {booking.has_client_note && (booking.client_note || '').trim() ? (
              <button
                type="button"
                onClick={(e) => handleNoteClick(booking, e)}
                className="note-trigger-btn ml-0.5 inline-flex shrink-0 align-middle text-[#2D2D2D] no-underline hover:opacity-80"
                title="Заметка"
              >
                <InformationCircleIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </p>
        </div>
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-3 pl-1 sm:gap-4 sm:pl-2">
          <div className="w-[4.5rem] shrink-0 text-right sm:w-24">
            {amountRub > 0 ? (
              <span className="text-[13.5px] font-semibold tabular-nums text-[#2D2D2D]">{formatMoney(amountRub)}</span>
            ) : (
              <span className="text-[12px] font-medium text-[#A0A0A0]">—</span>
            )}
          </div>
          <div className="flex w-[6.5rem] shrink-0 justify-center sm:w-[6.75rem]">
            <span
              className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-medium leading-tight sm:px-2.5 sm:py-0.5 ${stPill.className}`}
            >
              {stPill.label}
            </span>
          </div>
          <div className="flex w-[4.5rem] shrink-0 items-center justify-end gap-1.5 sm:w-[4.75rem]">
            {showPreVisit || showCancel ? (
              <>
                {showPreVisit && (
                  <button
                    type="button"
                    onClick={() => handleConfirmPreVisit(booking.id)}
                    disabled={confirmLoading}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#B1DBC4] bg-[#DFF5EC] text-[#3D8B42] transition-colors hover:bg-[#C8E8D8] disabled:opacity-50"
                    aria-label="Подтвердить"
                  >
                    {confirmLoading ? <span className="text-xs">...</span> : <CheckIcon className="h-3.5 w-3.5" />}
                  </button>
                )}
                {showCancel && (
                  <button
                    type="button"
                    onClick={() => handleCancelClick(booking)}
                    disabled={cancelLoading}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#FECACA] bg-[#FEF2F2] text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                    aria-label="Отменить"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            ) : (
              <span className="inline-block h-1 w-8" aria-hidden />
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderActivityPastItem = (booking) => {
    const b = { ...booking, start_time: booking.start_time || (booking.date && booking.time ? `${booking.date}T${booking.time}:00` : '') };
    const showConfirm = canConfirmPostVisit(b, masterSettings?.master ?? null);
    const showCancel = canCancelBooking(b);
    const dispName = (booking.client_display_name || booking.client_name || '').trim() || 'Клиент';
    const clientLabel = booking.client_phone ? `${dispName} (${booking.client_phone})` : dispName;
    const timeStr = b.start_time ? (formatTimeShort(b.start_time) || booking.time || '') : (booking.time || '—');
    const st = b.start_time ? new Date(b.start_time) : null;
    const validD = st && !Number.isNaN(st.getTime());
    const wkShort = validD ? st.toLocaleDateString('ru-RU', { weekday: 'short' }).toUpperCase() : '';
    const dateShort = validD
      ? `${st.getDate()} ${st.toLocaleDateString('ru-RU', { month: 'short' })}`
      : '';
    const meta = getStatusBadgeForPast(b, masterSettings?.master ?? null);
    const pay = Number(booking.payment_amount);
    const svc = Number(booking.service_price);
    const amountRub = pay > 0 ? pay : (svc > 0 ? svc : 0);
    return (
      <div className="group flex w-full min-w-0 items-center gap-3 text-sm sm:gap-4">
        <div className="w-[58px] min-w-[58px] shrink-0 select-none text-center sm:w-[64px] sm:min-w-[64px]">
          <p className="text-[10px] font-semibold leading-none tracking-[0.05em] text-[#A0A0A0]">{wkShort || '—'}</p>
          <p className="mt-1.5 text-base font-bold tabular-nums leading-none text-[#2D2D2D]">{timeStr !== '—' ? timeStr : '—'}</p>
          <p className="mt-1.5 text-[10px] leading-tight text-[#A0A0A0]">{dateShort || '—'}</p>
        </div>
        <div className="min-w-0 flex-1 pl-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-[13px] font-medium text-[#2D2D2D]">{booking.service_name}</p>
            <span className="shrink-0 rounded bg-[#F4F1EF] px-1.5 py-0.5 text-[10px] font-medium leading-none text-[#6B6B6B]">
              прошло
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-[#6B6B6B]">
            <span className="break-words">{clientLabel}</span>
            {booking.has_client_note && (booking.client_note || '').trim() ? (
              <button
                type="button"
                onClick={(e) => handleNoteClick(booking, e)}
                className="note-trigger-btn ml-0.5 inline-flex shrink-0 align-middle text-[#2D2D2D] no-underline hover:opacity-80"
                title="Заметка"
              >
                <InformationCircleIcon className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </p>
        </div>
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-3 pl-1 sm:gap-4 sm:pl-2">
          <div className="w-[4.5rem] shrink-0 text-right sm:w-24">
            {amountRub > 0 ? (
              <span className="text-[13.5px] font-semibold tabular-nums text-[#2D2D2D]">{formatMoney(amountRub)}</span>
            ) : (
              <span className="text-[12px] font-medium text-[#A0A0A0]">—</span>
            )}
          </div>
          <div className="flex w-[6.5rem] shrink-0 justify-center sm:w-[6.75rem]">
            <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-medium leading-tight opacity-90 sm:px-2.5 sm:py-0.5 ${meta.cls}`}>
              {meta.label}
            </span>
          </div>
          {showConfirm || showCancel ? (
            <div className="flex w-[4.5rem] shrink-0 items-center justify-end gap-1.5 sm:w-[4.75rem]">
              {showConfirm ? (
                <button
                  type="button"
                  onClick={() => handleConfirmPostVisit(booking.id)}
                  disabled={confirmLoading}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#B1DBC4] bg-[#DFF5EC] text-[#3D8B42] transition-colors hover:bg-[#C8E8D8] disabled:opacity-50"
                  aria-label="Подтвердить"
                >
                  {confirmLoading ? <span className="text-xs">...</span> : <CheckIcon className="h-3.5 w-3.5" />}
                </button>
              ) : null}
              {showCancel ? (
                <button
                  type="button"
                  onClick={() => handleCancelClick(booking)}
                  disabled={cancelLoading}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#FECACA] bg-[#FEF2F2] text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                  aria-label="Отменить"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          ) : (
            <div className="w-[4.5rem] sm:w-[4.75rem]" aria-hidden />
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="rounded-[14px] border border-[#E7E2DF] bg-white p-6 shadow-[0_1px_2px_rgba(45,45,45,0.06)]">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
        <button
          onClick={loadDashboardStats}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  // Кастомный тултип для графиков
  const CustomTooltip = ({ active, payload, label, chartType }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const periodTitle =
        formatStatsBucketRange(data.period_start, data.period_end) || normalizeLegacyPeriodLabel(label);

      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <div className="mb-2">
            <p className="font-semibold text-gray-900">
              {periodTitle}
            </p>
          </div>
          
          {chartType === 'bookings' ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Подтверждённые</span>
                <span className="font-semibold">{Number(data.bookings_confirmed ?? 0)} шт</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Ожидающие</span>
                <span className="font-semibold">{Number(data.bookings_pending ?? 0)} шт</span>
              </div>
              <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-1">
                <span className="text-gray-800">Всего</span>
                <span className="font-semibold">
                  {Number(data.bookings_total ?? data.bookings ?? 0)} шт
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-500">Изменение</span>
                <span className={`font-semibold ${data.bookings_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.bookings_change > 0 ? '+' : ''}{data.bookings_change}%
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Подтверждённый</span>
                <span className="font-semibold">
                  {Math.round(Number(data.income_confirmed_rub ?? data.income ?? 0)).toLocaleString('ru-RU')} ₽
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Ожидающий</span>
                <span className="font-semibold">
                  {Math.round(Number(data.income_pending_rub ?? 0)).toLocaleString('ru-RU')} ₽
                </span>
              </div>
              <div className="flex items-center justify-between text-sm border-t border-gray-100 pt-1">
                <span className="text-gray-800">Всего</span>
                <span className="font-semibold">
                  {Math.round(Number(data.income_total_rub ?? data.income ?? 0)).toLocaleString('ru-RU')} ₽
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-green-500">Изменение</span>
                <span className={`font-semibold ${data.income_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.income_change > 0 ? '+' : ''}{data.income_change}%
                </span>
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const currentStatsBucket =
    stats.weeks_data?.find((w) => w.is_current) ?? stats.weeks_data?.[0] ?? null;

  const topServicesSectionMobile = (
    <div className="rounded-[10px] border border-[#E7E2DF] bg-white p-3.5 shadow-[0_1px_2px_rgba(45,45,45,0.06)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-semibold leading-tight text-[#2D2D2D]">
          Топ услуг{stats.top_period_range ? <span className="ml-1 font-normal text-[#6B6B6B]">· {stats.top_period_range}</span> : null}
        </h4>
        <div className="flex shrink-0 gap-0.5 rounded-md bg-[#F4F1EF] p-0.5">
          <button
            type="button"
            onClick={() => setServicesStatsTab('bookings')}
            className={`rounded-[5px] px-2 py-0.5 text-[10.5px] font-medium transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-1 ${
              servicesStatsTab === 'bookings'
                ? 'bg-white text-[#2D2D2D] shadow-sm'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            Записи
          </button>
          <button
            type="button"
            onClick={() => setServicesStatsTab('earnings')}
            className={`rounded-[5px] px-2 py-0.5 text-[10.5px] font-medium transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-1 ${
              servicesStatsTab === 'earnings'
                ? 'bg-white text-[#2D2D2D] shadow-sm'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
            }`}
          >
            Доход
          </button>
        </div>
      </div>
      {servicesStatsTab === 'bookings' ? (
        stats.top_services_by_bookings && stats.top_services_by_bookings.length > 0 ? (
          (() => {
            const list = stats.top_services_by_bookings.slice(0, 3);
            const maxV = Math.max(1, ...list.map((s) => Number(s.booking_count) || 0));
            return (
              <div className="space-y-2.5">
                {list.map((service) => {
                  const count = Number(service.booking_count) || 0;
                  const share = Math.min(100, Math.round((count / maxV) * 100));
                  return (
                    <div key={service.service_id}>
                      <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
                        <span className="min-w-0 truncate text-[#2D2D2D]">{stripIndiePrefix(service.service_name)}</span>
                        <strong className="shrink-0 tabular-nums font-semibold text-[#2D2D2D]">{count} зап.</strong>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-[#F4F1EF]">
                        <div
                          className="h-full rounded-full bg-[#4CAF50] transition-[width] duration-300"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        ) : (
          <p className="py-3 text-center text-[12px] text-gray-500">Нет данных за период</p>
        )
      ) : stats.top_services_by_earnings && stats.top_services_by_earnings.length > 0 ? (
        (() => {
          const list = stats.top_services_by_earnings.slice(0, 3);
          const maxE = Math.max(1, ...list.map((s) => Math.round(Number(s.total_earnings) || 0)));
          return (
            <div className="space-y-2.5">
              {list.map((service) => {
                const amount = Math.round(Number(service.total_earnings) || 0);
                const share = Math.min(100, Math.round((amount / maxE) * 100));
                return (
                  <div key={service.service_id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="min-w-0 truncate text-[#2D2D2D]">{stripIndiePrefix(service.service_name)}</span>
                      <strong className="shrink-0 tabular-nums font-semibold text-[#2D2D2D]">
                        {amount.toLocaleString('ru-RU')} ₽
                      </strong>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-[#F4F1EF]">
                      <div
                        className="h-full rounded-full bg-[#4CAF50] transition-[width] duration-300"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()
      ) : (
        <p className="py-3 text-center text-[12px] text-gray-500">Нет данных за период</p>
      )}
    </div>
  );

  const topServicesSectionDesktop = (
    <section className="overflow-hidden rounded-[20px] border border-[#E7E2DF] bg-white shadow-[0_24px_60px_-22px_rgba(45,45,45,0.18)] ring-1 ring-[#2D2D2D]/[0.04]">
      <div className="border-b border-[#E7E2DF]/70 bg-[linear-gradient(180deg,#FFFFFF_0%,#FAF8F6_100%)] px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3D8B42]">Аналитика</p>
            <h3 className="mt-1 text-[16px] font-semibold leading-tight tracking-tight text-[#2D2D2D]">Топ услуг</h3>
          </div>
          {stats.top_period_range ? (
            <span className="shrink-0 rounded-full border border-[#DFF5EC] bg-[#DFF5EC] px-2.5 py-1 text-[11px] font-semibold leading-none text-[#3D8B42]">
              {stats.top_period_range}
            </span>
          ) : null}
        </div>
      </div>

      <div className="px-6 py-5">
      <div className="mb-4 flex w-full gap-0.5 rounded-[10px] border border-[#E7E2DF] bg-[#F4F1EF] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
        <button
          type="button"
          onClick={() => setServicesStatsTab('bookings')}
          className={`min-h-0 flex-1 rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-1 ${
            servicesStatsTab === 'bookings'
              ? 'bg-white text-[#2D2D2D] shadow-[0_1px_2px_rgba(45,45,45,0.10)]'
              : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white/30'
          }`}
        >
          По записям
        </button>
        <button
          type="button"
          onClick={() => setServicesStatsTab('earnings')}
          className={`min-h-0 flex-1 rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-1 ${
            servicesStatsTab === 'earnings'
              ? 'bg-white text-[#2D2D2D] shadow-[0_1px_2px_rgba(45,45,45,0.10)]'
              : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white/30'
          }`}
        >
          По доходу
        </button>
      </div>
      <div className="space-y-4">
        {servicesStatsTab === 'bookings' ? (
          stats.top_services_by_bookings && stats.top_services_by_bookings.length > 0 ? (
            (() => {
              const list = stats.top_services_by_bookings.slice(0, 5);
              const maxV = Math.max(1, ...list.map((s) => Number(s.booking_count) || 0));
              return list.map((service, index) => {
                const count = Number(service.booking_count) || 0;
                const share = Math.min(100, Math.round((count / maxV) * 100));
                return (
                  <div
                    key={service.service_id}
                    className="rounded-[14px] border border-[#E7E2DF]/80 bg-gradient-to-b from-white to-[#FDFCFB] p-4 shadow-[0_10px_28px_-20px_rgba(45,45,45,0.18)]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#DFF5EC] text-[13px] font-extrabold tabular-nums text-[#3D8B42] ring-1 ring-[#4CAF50]/12">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold leading-snug text-[#2D2D2D]">
                            {stripIndiePrefix(service.service_name)}
                          </p>
                          <p className="mt-0.5 text-[12px] leading-snug text-[#A0A0A0]">{share}% от лидера</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-right text-[14px] font-semibold tabular-nums text-[#2D2D2D]">
                        {count} <span className="text-[11px] font-medium text-[#6B6B6B]">зап.</span>
                      </span>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#E7E2DF]/70">
                      <div
                        className="h-full min-w-0 rounded-full bg-gradient-to-r from-[#4CAF50] to-[#6FCF7A]"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                );
              });
            })()
          ) : (
            <div className="rounded-[14px] border border-dashed border-[#E7E2DF] bg-[#F9F7F5] px-6 py-10 text-center">
              <p className="text-[14px] font-semibold text-[#2D2D2D]">Нет данных за период</p>
              <p className="mt-1 text-[13px] text-[#6B6B6B]">Как появятся записи, здесь появится топ</p>
            </div>
          )
        ) : stats.top_services_by_earnings && stats.top_services_by_earnings.length > 0 ? (
          (() => {
            const list = stats.top_services_by_earnings.slice(0, 5);
            const maxE = Math.max(1, ...list.map((s) => Math.round(Number(s.total_earnings) || 0)));
            return list.map((service, index) => {
              const amount = Math.round(Number(service.total_earnings) || 0);
              const share = Math.min(100, Math.round((amount / maxE) * 100));
              return (
                <div
                  key={service.service_id}
                  className="rounded-[14px] border border-[#E7E2DF]/80 bg-gradient-to-b from-white to-[#FDFCFB] p-4 shadow-[0_10px_28px_-20px_rgba(45,45,45,0.18)]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#DFF5EC] text-[13px] font-extrabold tabular-nums text-[#3D8B42] ring-1 ring-[#4CAF50]/12">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold leading-snug text-[#2D2D2D]">
                          {stripIndiePrefix(service.service_name)}
                        </p>
                        <p className="mt-0.5 text-[12px] leading-snug text-[#A0A0A0]">{share}% от лидера</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-right text-[14px] font-semibold tabular-nums text-[#2D2D2D]">
                      {amount.toLocaleString('ru-RU')} <span className="text-[11px] font-medium text-[#6B6B6B]">₽</span>
                    </span>
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#E7E2DF]/70">
                    <div
                      className="h-full min-w-0 rounded-full bg-gradient-to-r from-[#4CAF50] to-[#6FCF7A]"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
              );
            });
          })()
        ) : (
          <div className="rounded-[14px] border border-dashed border-[#E7E2DF] bg-[#F9F7F5] px-6 py-10 text-center">
            <p className="text-[14px] font-semibold text-[#2D2D2D]">Нет данных за период</p>
            <p className="mt-1 text-[13px] text-[#6B6B6B]">Как появится выручка, здесь появится топ</p>
          </div>
        )}
      </div>
      </div>
    </section>
  );

  const desktopBookingHub = (
    <section className="hidden min-w-0 overflow-hidden rounded-[22px] border border-[#E7E2DF] bg-white shadow-[0_28px_72px_-26px_rgba(45,45,45,0.22)] ring-1 ring-[#2D2D2D]/[0.045] lg:block">
      <div className="relative border-b border-[#E7E2DF]/75 bg-[linear-gradient(180deg,#FFFFFF_0%,#FAF8F6_100%)] px-6 py-5">
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[#4CAF50]/10 blur-3xl" aria-hidden />
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3D8B42]">Рабочий модуль</p>
            <h2 className="mt-1 text-[18px] font-semibold leading-tight tracking-tight text-[#2D2D2D]">Записи</h2>
            <p className="mt-1 text-[13px] leading-snug text-[#6B6B6B]">Ближайшие, прошедшие и те, что требуют подтверждения</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (desktopBookingTab === 'past') {
                setAllBookingsModalMode('past');
              } else if (desktopBookingTab === 'pending') {
                setAllBookingsModalMode(desktopPendingPastAll.length > 0 && desktopPendingFutureAll.length === 0 ? 'past' : 'future');
              } else {
                setAllBookingsModalMode('future');
              }
              setShowAllBookingsModal(true);
            }}
            className="inline-flex shrink-0 items-center justify-center rounded-[12px] border border-[#E7E2DF] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#2D2D2D] shadow-[0_2px_10px_rgba(45,45,45,0.08)] transition hover:bg-[#F4F1EF]"
          >
            Все записи
          </button>
        </div>
      </div>

      <div className="border-b border-[#E7E2DF] bg-[linear-gradient(180deg,#FFFFFF_0%,#FAF8F6_100%)] px-6 py-4">
        <div
          className="flex w-full min-w-0 items-center gap-0.5 rounded-[12px] border border-[#E7E2DF] bg-[#F4F1EF] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
          role="tablist"
          aria-label="Записи по статусу"
        >
          <button
            type="button"
            role="tab"
            aria-selected={desktopBookingTab === 'future'}
            onClick={() => setDesktopBookingTab('future')}
            className={`min-h-[40px] min-w-0 flex-1 rounded-[10px] px-3 py-2 text-[13px] font-semibold transition ${
              desktopBookingTab === 'future'
                ? 'bg-white text-[#2D2D2D] shadow-[0_1px_2px_rgba(45,45,45,0.10)]'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white/30'
            }`}
          >
            <span className="whitespace-nowrap">Будущие</span>
            <span
              className={`ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${
                desktopBookingTab === 'future' ? 'bg-[#DFF5EC] text-[#3D8B42]' : 'bg-white/50 text-[#6B6B6B]'
              }`}
            >
              {desktopFutureCount}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={desktopBookingTab === 'past'}
            onClick={() => setDesktopBookingTab('past')}
            className={`min-h-[40px] min-w-0 flex-1 rounded-[10px] px-3 py-2 text-[13px] font-semibold transition ${
              desktopBookingTab === 'past'
                ? 'bg-white text-[#2D2D2D] shadow-[0_1px_2px_rgba(45,45,45,0.10)]'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white/30'
            }`}
          >
            <span className="whitespace-nowrap">Прошедшие</span>
            <span
              className={`ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${
                desktopBookingTab === 'past' ? 'bg-[#E8E0DA]/80 text-[#4A3F38]' : 'bg-white/50 text-[#6B6B6B]'
              }`}
            >
              {desktopPastCount}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={desktopBookingTab === 'pending'}
            onClick={() => setDesktopBookingTab('pending')}
            className={`min-h-[40px] min-w-0 flex-1 rounded-[10px] px-3 py-2 text-[13px] font-semibold transition ${
              desktopBookingTab === 'pending'
                ? 'bg-white text-[#2D2D2D] shadow-[0_1px_2px_rgba(45,45,45,0.10)]'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white/30'
            }`}
          >
            <span className="whitespace-nowrap">Ожидают</span>
            <span
              className={`ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${
                desktopBookingTab === 'pending' ? 'bg-[#FEF7E6] text-[#B45309]' : 'bg-white/50 text-[#6B6B6B]'
              }`}
            >
              {desktopPendingCount}
            </span>
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-b from-[#F9F7F4] to-[#F3EEEA]/90 px-6 py-5">
        {desktopBookingTab === 'future' ? (
          desktopFutureTop3.length > 0 ? (
            <ul className="m-0 list-none space-y-2.5 p-0">
              {desktopFutureTop3.map((b, i) => (
                <li
                  key={b.id || `t-${i}`}
                  className="m-0 overflow-hidden rounded-[16px] border border-[#E7E2DF] bg-gradient-to-b from-white to-[#FDFBFA] px-4 py-3.5 shadow-[0_10px_28px_-20px_rgba(45,45,45,0.20)]"
                >
                  {renderActivityFutureRow(b)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-[16px] border border-dashed border-[#E7E2DF] bg-white/70 px-6 py-10 text-center">
              <p className="text-[14px] font-semibold text-[#2D2D2D]">Будущих визитов нет</p>
              <p className="mt-1 text-[13px] text-[#6B6B6B]">Проверьте «Ожидают» или откройте все записи</p>
            </div>
          )
        ) : null}

        {desktopBookingTab === 'pending' ? (
          desktopPendingTop3.length > 0 ? (
            <ul className="m-0 list-none space-y-2.5 p-0">
              {desktopPendingTop3.map((item, i) => (
                <li
                  key={item?.b?.id || `p-${item.kind}-${i}`}
                  className="m-0 overflow-hidden rounded-[16px] border border-[#E7E2DF] bg-gradient-to-b from-white to-[#FDFBFA] px-4 py-3.5 shadow-[0_10px_28px_-20px_rgba(45,45,45,0.20)]"
                >
                  {item.kind === 'past' ? renderActivityPastItem(item.b) : renderActivityFutureRow(item.b)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-[16px] border border-dashed border-[#E7E2DF] bg-white/70 px-6 py-10 text-center">
              <p className="text-[14px] font-semibold text-[#2D2D2D]">Нет записей, требующих подтверждения</p>
              <p className="mt-1 text-[13px] text-[#6B6B6B]">Здесь появятся визиты, которые нужно подтвердить</p>
            </div>
          )
        ) : null}

        {desktopBookingTab === 'past' ? (
          pastBookingsLoading ? (
            <div className="rounded-[16px] border border-dashed border-[#E7E2DF] bg-white/70 px-6 py-10 text-center">
              <p className="text-[14px] font-semibold text-[#6B6B6B]">Загрузка…</p>
            </div>
          ) : pastBookings.length > 0 ? (
            <ul className="m-0 list-none space-y-2.5 p-0">
              {pastBookings.map((booking) => (
                <li
                  key={booking.id}
                  className="m-0 overflow-hidden rounded-[16px] border border-[#E7E2DF] bg-gradient-to-b from-white to-[#FDFBFA] px-4 py-3.5 shadow-[0_10px_28px_-20px_rgba(45,45,45,0.20)] opacity-[0.92]"
                >
                  {renderActivityPastItem(booking)}
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-[16px] border border-dashed border-[#E7E2DF] bg-white/70 px-6 py-10 text-center">
              <p className="text-[14px] font-semibold text-[#2D2D2D]">Нет прошедших записей</p>
              <p className="mt-1 text-[13px] text-[#6B6B6B]">История появится после завершённых визитов</p>
            </div>
          )
        ) : null}
      </div>
    </section>
  );

  return (
    <div className="space-y-4 lg:space-y-5">
      {currentStatsBucket && (
        <div className="lg:contents">
          {/* Mobile KPI mini row — 2 compact cards; hidden on desktop */}
          <div className="grid grid-cols-2 gap-2 lg:hidden">
            <div className="relative overflow-hidden rounded-[10px] bg-gradient-to-br from-[#4CAF50] to-[#45A049] p-3 text-white shadow-[0_1px_2px_rgba(45,45,45,0.06)] after:pointer-events-none after:absolute after:-right-5 after:-top-5 after:h-20 after:w-20 after:rounded-full after:bg-white/10 after:content-['']">
              <p className="relative z-[1] text-[10px] font-semibold uppercase tracking-[0.03em] text-white/80">
                Выручка{stats.top_period_range ? ` · ${stats.top_period_range}` : ''}
              </p>
              <p className="relative z-[1] mt-1 text-[18px] font-bold tabular-nums tracking-[-0.03em] leading-[1.1] text-white">
                {formatMoney(Math.round(Number(currentStatsBucket.income_total_rub ?? currentStatsBucket.income ?? 0)))}
              </p>
              {typeof currentStatsBucket.income_change === 'number' && (
                <span className="relative z-[1] mt-1.5 inline-flex items-center gap-0.5 rounded-full bg-white/22 px-1.5 py-[1px] text-[10px] font-semibold text-white">
                  {currentStatsBucket.income_change > 0 ? '↑' : currentStatsBucket.income_change < 0 ? '↓' : ''}{' '}
                  {currentStatsBucket.income_change > 0 ? '+' : ''}
                  {currentStatsBucket.income_change}%
                </span>
              )}
            </div>
            <div className="rounded-[10px] border border-[#E7E2DF] bg-white p-3 shadow-[0_1px_2px_rgba(45,45,45,0.06)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.03em] text-[#A0A0A0]">
                Записей{stats.top_period_range ? ` · ${stats.top_period_range}` : ''}
              </p>
              <p className="mt-1 text-[18px] font-bold tabular-nums tracking-[-0.03em] leading-[1.1] text-[#2D2D2D]">
                {Number(currentStatsBucket.bookings_total ?? currentStatsBucket.bookings ?? 0)}
              </p>
              <p className="mt-1 text-[10px] text-[#A0A0A0]">
                <span className="font-semibold text-[#3D8B42]">{Number(currentStatsBucket.bookings_confirmed ?? 0)}</span>
                <span className="mx-1">·</span>
                <span className="font-semibold text-amber-700">{Number(currentStatsBucket.bookings_pending ?? 0)}</span> ожидают
              </p>
            </div>
          </div>
          {/* Desktop KPI 3-card grid — unchanged; hidden on mobile */}
          <div className="hidden lg:mt-0 lg:grid lg:grid-cols-3 lg:gap-4 lg:border-t lg:border-[#E7E2DF]/45 lg:pt-6">
          <div className="relative overflow-hidden rounded-[16px] border border-transparent bg-gradient-to-br from-[#4CAF50] to-[#2E7D32] p-4 text-white shadow-[0_10px_28px_-8px_rgba(46,125,50,0.55)] after:pointer-events-none after:absolute after:-right-8 after:-top-8 after:h-32 after:w-32 after:rounded-full after:bg-white/10 after:content-[''] max-lg:rounded-2xl max-lg:p-4 lg:rounded-2xl lg:from-[#4CAF50] lg:to-[#45A049] lg:p-[18px] lg:shadow-[0_8px_28px_-12px_rgba(76,175,80,0.45)]">
            <div className="relative z-[1] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/80 lg:text-[12px] lg:font-medium lg:text-white/80">Доход за период</p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-[-0.02em] text-white lg:mt-3 lg:text-[26px] lg:leading-none">
                  {formatMoney(Math.round(Number(currentStatsBucket.income_total_rub ?? currentStatsBucket.income ?? 0)))}
                </p>
                {typeof currentStatsBucket.income_change === 'number' && (
                  <span
                    className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold lg:mt-2.5 ${
                      currentStatsBucket.income_change >= 0 ? 'bg-white/20 text-white' : 'bg-red-500/30 text-white'
                    }`}
                  >
                    {currentStatsBucket.income_change > 0 ? '+' : ''}
                    {currentStatsBucket.income_change}% к прошлому
                  </span>
                )}
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/20 p-2 lg:h-[34px] lg:w-[34px] lg:rounded-[10px] lg:p-0">
                <BanknotesIcon className="h-6 w-6 text-white lg:h-[18px] lg:w-[18px]" strokeWidth={2} aria-hidden />
              </div>
            </div>
          </div>
          <div className="rounded-[16px] border-2 border-[#E7E2DF] bg-white p-4 shadow-[0_8px_24px_-14px_rgba(45,45,45,0.14)] max-lg:border-2 max-lg:shadow-lg lg:rounded-2xl lg:border lg:border-[#E7E2DF] lg:p-[18px] lg:shadow-[0_4px_24px_-16px_rgba(45,45,45,0.08)]">
            <div className="flex items-start justify-between gap-2 lg:mb-0">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#A0A0A0] lg:text-[12px] lg:font-medium lg:text-[#6B6B6B]">Записей за период</p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-[-0.02em] text-[#2D2D2D] lg:mt-3 lg:text-[26px] lg:leading-none">
                  {Number(currentStatsBucket.bookings_total ?? currentStatsBucket.bookings ?? 0)}
                </p>
                {typeof currentStatsBucket.bookings_change === 'number' && (
                  <span
                    className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold lg:mt-2.5 ${
                      currentStatsBucket.bookings_change >= 0 ? 'bg-[#DFF5EC] text-[#3D8B42]' : 'bg-[#FEF2F2] text-[#EF4444]'
                    }`}
                  >
                    {currentStatsBucket.bookings_change > 0 ? '+' : ''}
                    {currentStatsBucket.bookings_change}%
                  </span>
                )}
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#DFF5EC] text-[#3D8B42] lg:h-[34px] lg:w-[34px]">
                <ChartBarIcon className="h-6 w-6 lg:h-[18px] lg:w-[18px]" strokeWidth={2} aria-hidden />
              </div>
            </div>
          </div>
          <div className="rounded-[16px] border-2 border-[#E7E2DF] bg-white p-4 shadow-[0_8px_24px_-14px_rgba(45,45,45,0.14)] max-lg:border-2 max-lg:shadow-lg lg:rounded-2xl lg:border lg:border-[#E7E2DF] lg:p-[18px] lg:shadow-[0_4px_24px_-16px_rgba(45,45,45,0.08)]">
            <div className="flex items-start justify-between gap-2 lg:mb-0">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#A0A0A0] lg:text-[12px] lg:font-medium lg:text-[#6B6B6B]">Подтверждённые / ожидают</p>
                <p className="mt-2 text-[#2D2D2D] lg:mt-3">
                  <span className="text-2xl font-bold tabular-nums tracking-[-0.02em] lg:text-[26px]">{Number(currentStatsBucket.bookings_confirmed ?? 0)}</span>
                  <span className="mx-1 text-[#A0A0A0]">/</span>
                  <span className="text-xl font-semibold tabular-nums text-amber-700 lg:text-[22px]">
                    {Number(currentStatsBucket.bookings_pending ?? 0)}
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-[#6B6B6B] lg:mt-2">в выбранном окне графиков</p>
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#F4F1EF] text-[#6B6B6B] lg:h-[34px] lg:w-[34px]">
                <PresentationChartLineIcon className="h-6 w-6 lg:h-[18px] lg:w-[18px]" strokeWidth={2} aria-hidden />
              </div>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Mobile quick-nav pills — practical short row (mobile-only) */}
      {(onOpenSchedule || onOpenServices || onOpenTariff || onOpenSettings) && (
        <nav
          className="flex gap-2 overflow-x-auto px-0.5 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden"
          aria-label="Быстрая навигация"
        >
          {onOpenSchedule && (
            <button
              type="button"
              onClick={onOpenSchedule}
              className="flex shrink-0 flex-col items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-2 rounded-xl"
            >
              <span className="relative flex h-[46px] w-[46px] items-center justify-center rounded-[14px] border border-[#C8E8D8] bg-[#DFF5EC] text-[#45A049]">
                <CalendarDaysIcon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </span>
              <span className="text-[10.5px] font-medium leading-tight text-[#6B6B6B]">Расписание</span>
            </button>
          )}
          {onOpenServices && (
            <button
              type="button"
              onClick={onOpenServices}
              className="flex shrink-0 flex-col items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-2 rounded-xl"
            >
              <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[14px] border border-[#E7E2DF] bg-white text-[#6B6B6B]">
                <BriefcaseIcon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </span>
              <span className="text-[10.5px] font-medium leading-tight text-[#6B6B6B]">Услуги</span>
            </button>
          )}
          {onOpenTariff && (
            <button
              type="button"
              onClick={onOpenTariff}
              className="flex shrink-0 flex-col items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-2 rounded-xl"
            >
              <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[14px] border border-[#E7E2DF] bg-white text-[#6B6B6B]">
                <BanknotesIcon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </span>
              <span className="text-[10.5px] font-medium leading-tight text-[#6B6B6B]">Тарифы</span>
            </button>
          )}
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex shrink-0 flex-col items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-2 rounded-xl"
            >
              <span className="flex h-[46px] w-[46px] items-center justify-center rounded-[14px] border border-[#E7E2DF] bg-white text-[#6B6B6B]">
                <Cog6ToothIcon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
              </span>
              <span className="text-[10.5px] font-medium leading-tight text-[#6B6B6B]">Настройки</span>
            </button>
          )}
        </nav>
      )}

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-12 lg:items-start lg:gap-5">
        <div className="min-w-0 space-y-4 max-lg:order-1 lg:col-span-8 lg:space-y-5">
      {/* Desktop: единая панель «Активность за неделю» (v3) */}
      <section className="mb-0 hidden min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#E7E2DF] bg-white shadow-[0_24px_60px_-20px_rgba(45,45,45,0.18)] ring-1 ring-[#2D2D2D]/[0.04] lg:mb-0 lg:flex">
        {/* Head */}
        <div className="border-b border-[#E7E2DF] bg-[linear-gradient(180deg,#FFFFFF_0%,#FAF8F6_100%)] px-6 py-4">
          <div className="flex items-end justify-between gap-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-[18px] font-semibold leading-tight tracking-tight text-[#2D2D2D]">
                Активность за неделю
              </h2>
            </div>
            <div className="flex shrink-0 items-end gap-3">
              <div className="flex w-[17rem] gap-0.5 rounded-[10px] border border-[#E7E2DF] bg-[#F4F1EF] p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]" role="group" aria-label="Показатель на графике">
                <button
                  type="button"
                  onClick={() => setActivityChartKind('bookings')}
                  className={`min-h-0 min-w-0 flex-1 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-1 ${
                    activityChartKind === 'bookings'
                      ? 'bg-white text-[#2D2D2D] shadow-[0_1px_2px_rgba(45,45,45,0.10)]'
                      : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white/30'
                  }`}
                >
                  Записи
                </button>
                <button
                  type="button"
                  onClick={() => setActivityChartKind('income')}
                  className={`min-h-0 min-w-0 flex-1 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-1 ${
                    activityChartKind === 'income'
                      ? 'bg-white text-[#2D2D2D] shadow-[0_1px_2px_rgba(45,45,45,0.10)]'
                      : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white/30'
                  }`}
                >
                  Выручка
                </button>
              </div>
              {onNavigateToStats ? (
                <button
                  type="button"
                  onClick={onNavigateToStats}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-[10px] border border-[#E7E2DF] bg-white px-4 py-2 text-[13px] font-medium text-[#2D2D2D] shadow-[0_1px_2px_rgba(45,45,45,0.06)] transition hover:bg-[#F4F1EF]"
                >
                  <PresentationChartLineIcon className="h-3.5 w-3.5 shrink-0 text-[#3D8B42]" strokeWidth={2} aria-hidden />
                  Раздел «Статистика»
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {/* Chart */}
        <div className="relative border-b border-[#E7E2DF] bg-white px-6 py-4">
          {!hasExtendedStats && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer bg-gray-800/70 backdrop-blur-[2px] transition hover:[&_p]:no-underline"
              onClick={() => {
                if (onOpenSubscriptionModal) {
                  onOpenSubscriptionModal();
                } else {
                  window.location.href = '/master?tab=tariff';
                }
              }}
            >
              <div className="max-w-sm px-4 py-6 text-center sm:p-8">
                <p className="mb-2 text-base font-semibold text-white underline sm:text-lg">Доступно в подписке Pro</p>
                <p className="text-xs text-gray-200 underline sm:text-sm">Обновите подписку для доступа к расширенной статистике</p>
              </div>
            </div>
          )}
          {stats.weeks_data && stats.weeks_data.length > 0 ? (
            <div className="relative h-[min(17.5rem,44vw)] w-full min-h-[13.25rem] lg:max-h-[18rem] lg:min-w-0" data-master-activity-chart="1">
              {isLg ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                {activityChartKind === 'bookings' ? (
                  <ComposedChart
                    data={stats.weeks_data}
                    margin={{ top: 16, right: 16, bottom: 12, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis
                      dataKey="period_label"
                      tick={{ fontSize: 11, fill: '#6B6B6B' }}
                      tickLine={false}
                      axisLine={{ stroke: '#E7E2DF' }}
                      tickFormatter={(value, index) =>
                        formatStatsAxisLabel(
                          stats.weeks_data[index]?.period_start,
                          stats.weeks_data[index]?.period_end,
                          value
                        )
                      }
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6B6B6B' }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                    />
                    <Tooltip content={<CustomTooltip chartType="bookings" />} cursor={{ fill: 'rgba(76,175,80,0.06)' }} />
                    <Bar stackId="bookings" dataKey="bookings_confirmed" fill="#4CAF50" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    <Bar stackId="bookings" dataKey="bookings_pending" fill="#C8E8D8" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  </ComposedChart>
                ) : (
                  <ComposedChart
                    data={stats.weeks_data}
                    margin={{ top: 16, right: 16, bottom: 12, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis
                      dataKey="period_label"
                      tick={{ fontSize: 11, fill: '#6B6B6B' }}
                      tickLine={false}
                      axisLine={{ stroke: '#E7E2DF' }}
                      tickFormatter={(value, index) =>
                        formatStatsAxisLabel(
                          stats.weeks_data[index]?.period_start,
                          stats.weeks_data[index]?.period_end,
                          value
                        )
                      }
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6B6B6B' }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip content={<CustomTooltip chartType="income" />} cursor={{ fill: 'rgba(76,175,80,0.06)' }} />
                    <Bar stackId="income" dataKey="income_confirmed_rub" fill="#4CAF50" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    <Bar stackId="income" dataKey="income_pending_rub" fill="#C8E8D8" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-[14rem] flex-col items-center justify-center rounded-[14px] border border-dashed border-[#E7E2DF] bg-[#F9F7F5] px-6 py-8 text-center">
              <p className="text-sm font-medium text-[#2D2D2D]">Нет данных для графиков</p>
              <p className="mt-1 text-xs text-[#6B6B6B]">Как появятся периоды, здесь отобразится динамика</p>
            </div>
          )}
          {stats.weeks_data && stats.weeks_data.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] leading-tight text-[#4A4A4A]">
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#4CAF50]" aria-hidden />
                <span>Подтверждённые</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#C8E8D8]" aria-hidden />
                <span>Ожидают</span>
              </div>
            </div>
          )}
        </div>
      </section>
      {/* Desktop: booking hub сразу под Активностью — возвращено в col-span-8 */}
      {desktopBookingHub}
      {/* Mobile booking hub: светлая карточка, согласованная с desktop */}
      <section
        className="lg:hidden overflow-hidden rounded-[16px] border border-[#E7E2DF] bg-white shadow-[0_1px_2px_rgba(45,45,45,0.06)]"
        aria-label="Записи: будущие, прошедшие, ожидают"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#E7E2DF] px-4 py-3">
          <h2 className="text-[15px] font-semibold leading-tight text-[#2D2D2D]">Записи</h2>
          <button
            type="button"
            onClick={() => {
              setAllBookingsModalMode(activityListTab === 'past' ? 'past' : 'future');
              setShowAllBookingsModal(true);
            }}
            className="inline-flex shrink-0 items-center justify-center rounded-[10px] border border-[#E7E2DF] bg-white px-3 py-1.5 text-[12px] font-medium text-[#2D2D2D] shadow-[0_1px_2px_rgba(45,45,45,0.06)] transition hover:bg-[#F4F1EF]"
          >
            Все записи
          </button>
        </div>

        <div className="border-b border-[#E7E2DF] bg-white px-3 py-2.5">
          <div
            className="flex w-full min-w-0 items-center gap-0.5 rounded-[10px] border border-[#E7E2DF] bg-[#F4F1EF] p-[3px]"
            role="tablist"
            aria-label="Записи по статусу"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activityListTab === 'future'}
              onClick={() => setActivityListTab('future')}
              className={`min-h-[36px] min-w-0 flex-1 rounded-[8px] px-2 py-1.5 text-[12px] font-semibold transition ${
                activityListTab === 'future'
                  ? 'bg-white text-[#2D2D2D] shadow-[0_1px_2px_rgba(45,45,45,0.10)]'
                  : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white/30'
              }`}
            >
              <span className="whitespace-nowrap">Будущие</span>
              <span
                className={`ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${
                  activityListTab === 'future' ? 'bg-[#DFF5EC] text-[#3D8B42]' : 'bg-white/50 text-[#6B6B6B]'
                }`}
              >
                {desktopFutureCount}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activityListTab === 'past'}
              onClick={() => setActivityListTab('past')}
              className={`min-h-[36px] min-w-0 flex-1 rounded-[8px] px-2 py-1.5 text-[12px] font-semibold transition ${
                activityListTab === 'past'
                  ? 'bg-white text-[#2D2D2D] shadow-[0_1px_2px_rgba(45,45,45,0.10)]'
                  : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white/30'
              }`}
            >
              <span className="whitespace-nowrap">Прошедшие</span>
              <span
                className={`ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${
                  activityListTab === 'past' ? 'bg-[#E8E0DA]/80 text-[#4A3F38]' : 'bg-white/50 text-[#6B6B6B]'
                }`}
              >
                {desktopPastCount}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activityListTab === 'pending'}
              onClick={() => setActivityListTab('pending')}
              className={`min-h-[36px] min-w-0 flex-1 rounded-[8px] px-2 py-1.5 text-[12px] font-semibold transition ${
                activityListTab === 'pending'
                  ? 'bg-white text-[#2D2D2D] shadow-[0_1px_2px_rgba(45,45,45,0.10)]'
                  : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white/30'
              }`}
            >
              <span className="whitespace-nowrap">Ожидают</span>
              <span
                className={`ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${
                  activityListTab === 'pending' ? 'bg-[#FEF7E6] text-[#B45309]' : 'bg-white/50 text-[#6B6B6B]'
                }`}
              >
                {desktopPendingCount}
              </span>
            </button>
          </div>
        </div>

        <div className="bg-[#FBF9F7] px-3 pb-4 pt-3">
          {activityListTab === 'future' ? (
            desktopFutureAll.length > 0 ? (
              <ul className="m-0 list-none space-y-3 p-0">
                {desktopFutureAll.slice(0, 3).map((b, i) => {
                  const normalized = {
                    ...b,
                    start_time: b.start_time || (b.date && b.time ? `${b.date}T${b.time}:00` : ''),
                  };
                  return (
                    <li key={b.id || `f-${i}`} className="m-0 p-0">
                      <MasterBookingCardMobile
                        variant="hub"
                        booking={normalized}
                        sectionType="future"
                        master={masterSettings?.master ?? null}
                        hasExtendedStats={hasExtendedStats}
                        actionBookingId={actionBookingId}
                        onOpenDetail={(book) => setMobileBookingDetail({ booking: book, sectionType: 'future' })}
                        onConfirm={handleConfirmUnified}
                        onCancelClick={(id) => setCancelBookingId(id)}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-[12px] border border-dashed border-[#E7E2DF] bg-white px-5 py-8 text-center">
                <p className="text-[13px] font-semibold text-[#2D2D2D]">Будущих визитов нет</p>
                <p className="mt-1 text-[12px] text-[#6B6B6B]">Проверьте «Ожидают» или откройте все записи</p>
              </div>
            )
          ) : null}
          {activityListTab === 'pending' ? (
            desktopPendingAll.length > 0 ? (
              <ul className="m-0 list-none space-y-3 p-0">
                {desktopPendingAll.slice(0, 3).map((item, i) => {
                  const b = {
                    ...item.b,
                    start_time:
                      item.b.start_time ||
                      (item.b.date && item.b.time ? `${item.b.date}T${item.b.time}:00` : ''),
                  };
                  const sectionType = item.kind === 'past' ? 'past' : 'future';
                  return (
                    <li key={b.id || `p-${item.kind}-${i}`} className="m-0 p-0">
                      <MasterBookingCardMobile
                        variant="hub"
                        booking={b}
                        sectionType={sectionType}
                        master={masterSettings?.master ?? null}
                        hasExtendedStats={hasExtendedStats}
                        actionBookingId={actionBookingId}
                        onOpenDetail={(book) => setMobileBookingDetail({ booking: book, sectionType })}
                        onConfirm={handleConfirmUnified}
                        onCancelClick={(id) => setCancelBookingId(id)}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-[12px] border border-dashed border-[#E7E2DF] bg-white px-5 py-8 text-center">
                <p className="text-[13px] font-semibold text-[#2D2D2D]">Нет записей, требующих подтверждения</p>
                <p className="mt-1 text-[12px] text-[#6B6B6B]">Здесь появятся визиты, которые нужно подтвердить</p>
              </div>
            )
          ) : null}
          {activityListTab === 'past' ? (
            pastBookingsLoading ? (
              <div className="rounded-[12px] border border-[#E7E2DF] bg-white px-5 py-8 text-center">
                <p className="text-[13px] font-semibold text-[#6B6B6B]">Загрузка…</p>
              </div>
            ) : pastBookings.length > 0 ? (
              <ul className="m-0 list-none space-y-3 p-0">
                {pastBookings.slice(0, 3).map((booking) => {
                  const b = {
                    ...booking,
                    start_time: booking.start_time || (booking.date && booking.time ? `${booking.date}T${booking.time}:00` : ''),
                  };
                  return (
                    <li key={booking.id} className="m-0 p-0">
                      <MasterBookingCardMobile
                        variant="hub"
                        booking={b}
                        sectionType="past"
                        master={masterSettings?.master ?? null}
                        hasExtendedStats={hasExtendedStats}
                        actionBookingId={actionBookingId}
                        onOpenDetail={(book) => setMobileBookingDetail({ booking: book, sectionType: 'past' })}
                        onConfirm={handleConfirmUnified}
                        onCancelClick={(id) => setCancelBookingId(id)}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-[12px] border border-dashed border-[#E7E2DF] bg-white px-5 py-8 text-center">
                <p className="text-[13px] font-semibold text-[#2D2D2D]">Нет прошедших записей</p>
                <p className="mt-1 text-[12px] text-[#6B6B6B]">История появится после завершённых визитов</p>
              </div>
            )
          ) : null}
        </div>
      </section>

      {notePopover && (
        <div className="hidden lg:block">
          <NotePopover content={notePopover.content} anchorRect={notePopover.anchorRect} onClose={() => setNotePopover(null)} />
        </div>
      )}

      {/* Модалка причины отмены — desktop */}
      {cancelBookingId && (
        <div className={`fixed inset-0 ${masterZClass('nested')} hidden items-center justify-center bg-black/50 lg:flex`}>
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold">Причина отмены</h3>
            <div className="space-y-2">
              {Object.entries(CANCELLATION_REASONS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleCancelWithReason(cancelBookingId, key)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-left text-sm hover:bg-gray-50"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCancelBookingId(null)}
              className="mt-4 w-full rounded px-4 py-2 text-gray-600 hover:bg-gray-100"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Mobile sheets: см. masterOverlayZIndex; desktop отмена — nested */}
      <div className="lg:hidden">
        {mobileBookingDetail ? (
          <MasterBookingDetailSheet
            isOpen
            booking={mobileBookingDetail.booking}
            sectionType={mobileBookingDetail.sectionType}
            master={masterSettings?.master ?? null}
            hasExtendedStats={hasExtendedStats}
            actionBookingId={actionBookingId}
            onClose={() => setMobileBookingDetail(null)}
            onConfirm={handleConfirmUnified}
            onCancelRequest={(id) => setCancelBookingId(id)}
            disableEscapeKey
          />
        ) : null}
        <MasterBookingCancelSheet
          isOpen={!!cancelBookingId}
          onClose={() => setCancelBookingId(null)}
          onSelectReason={(key) => handleCancelWithReason(cancelBookingId, key)}
          disableEscapeKey
        />
      </div>

      {/* Модальное окно со всеми записями */}
      {showAllBookingsModal && (
        <AllBookingsModal
          isOpen={showAllBookingsModal}
          onClose={() => setShowAllBookingsModal(false)}
          hasExtendedStats={hasExtendedStats}
          onConfirmSuccess={() => {
            loadDashboardStats();
            loadPastBookings();
            loadBookingsLimit();
          }}
          initialMode={allBookingsModalMode}
        />
      )}

      {/* Mobile finance mini row — доход + подтверждённые/ожидают (mobile-only) */}
      {currentStatsBucket && (
        <div className="grid grid-cols-2 gap-2 lg:hidden">
          <div className="rounded-[10px] border border-[#E7E2DF] bg-white p-3 shadow-[0_1px_2px_rgba(45,45,45,0.06)]">
            <p className="text-[11px] leading-tight text-[#A0A0A0]">
              Доход{stats.top_period_range ? ` · ${stats.top_period_range}` : ''}
            </p>
            <p className="mt-1 text-[15px] font-bold tabular-nums leading-tight text-[#45A049]">
              {formatMoney(Math.round(Number(currentStatsBucket.income_total_rub ?? currentStatsBucket.income ?? 0)))}
            </p>
          </div>
          <div className="rounded-[10px] border border-[#E7E2DF] bg-white p-3 shadow-[0_1px_2px_rgba(45,45,45,0.06)]">
            <p className="text-[11px] leading-tight text-[#A0A0A0]">Подтв./ожидают</p>
            <p className="mt-1 text-[15px] font-bold tabular-nums leading-tight text-[#2D2D2D]">
              <span>{Number(currentStatsBucket.bookings_confirmed ?? 0)}</span>
              <span className="mx-1 font-normal text-[#A0A0A0]">/</span>
              <span className="text-amber-700">{Number(currentStatsBucket.bookings_pending ?? 0)}</span>
            </p>
          </div>
        </div>
      )}

      {/* Mobile compact tariff card — тариф + срок + кнопка «Продлить» (mobile-only) */}
      {(balance || subscriptionStatus) && (onOpenSubscriptionModal || onOpenTariff) && (() => {
        const planTitle =
          subscriptionStatus?.plan_display_name ||
          getPlanNameInRussian(subscriptionStatus?.plan_name) ||
          'Free';
        const daysRemaining =
          typeof subscriptionStatus?.days_remaining === 'number'
            ? subscriptionStatus.days_remaining
            : null;
        return (
          <div className="relative flex items-center justify-between gap-3 overflow-hidden rounded-[10px] bg-gradient-to-br from-[#1B1B1B] to-[#2D2D2D] px-4 py-3 text-white before:pointer-events-none before:absolute before:-right-5 before:-top-5 before:h-24 before:w-24 before:rounded-full before:bg-[radial-gradient(circle,rgba(76,175,80,0.22),transparent_70%)] before:content-[''] lg:hidden">
            <div className="relative min-w-0">
              <p className="text-[11px] leading-tight text-white/60">Тариф</p>
              <p className="mt-0.5 truncate text-[14px] font-bold leading-tight text-white">
                {planTitle}
              </p>
              {daysRemaining != null && (
                <p className="mt-0.5 text-[11px] leading-tight text-white/60">
                  Осталось: {daysRemaining} дн.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (onOpenSubscriptionModal) {
                  onOpenSubscriptionModal();
                } else if (onOpenTariff) {
                  onOpenTariff();
                }
              }}
              className="relative shrink-0 whitespace-nowrap rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              Продлить →
            </button>
          </div>
        );
      })()}

      <div className="lg:hidden">{topServicesSectionMobile}</div>

      {/* Гистограммы: только mobile; на desktop график в панели «Активность за неделю» */}
      {stats.weeks_data && stats.weeks_data.length > 0 && (
        <div className="space-y-3 lg:hidden">
          <button
            type="button"
            onClick={() => setChartsExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-[#E7E2DF]/70 bg-white/60 px-3 py-2 text-left transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-1"
            aria-expanded={chartsExpanded}
          >
            <span className="flex items-center gap-2 min-w-0">
              <ChartBarIcon className="h-3.5 w-3.5 shrink-0 text-[#A0A0A0]" strokeWidth={2} aria-hidden />
              <span className="truncate text-[12px] font-medium text-[#6B6B6B]">Статистика за неделю</span>
            </span>
            <ChevronRightIcon
              className={`h-3.5 w-3.5 shrink-0 text-[#A0A0A0] transition-transform ${chartsExpanded ? 'rotate-90' : ''}`}
              strokeWidth={2}
              aria-hidden
            />
          </button>
          {chartsExpanded && onNavigateToStats ? (
            <button
              type="button"
              onClick={onNavigateToStats}
              className="inline-flex w-full items-center justify-center gap-1 rounded-[10px] border border-[#E7E2DF] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#6B6B6B] shadow-[0_1px_2px_rgba(45,45,45,0.06)] hover:bg-[#F4F1EF]"
            >
              <PresentationChartLineIcon
                className="h-3 w-3 shrink-0 text-[#A0A0A0]"
                strokeWidth={2}
                aria-hidden
              />
              <span className="truncate">Раздел «Статистика»</span>
            </button>
          ) : null}

          {chartsExpanded ? (
          <div
            ref={chartsAnchorRef}
            className="relative"
          >
            {!hasExtendedStats && (
            <div
              className="absolute inset-0 bg-gray-800 bg-opacity-70 rounded-xl lg:rounded-lg z-10 flex items-center justify-center cursor-pointer hover:[&_p]:no-underline"
              onClick={() => {
                if (onOpenSubscriptionModal) {
                  onOpenSubscriptionModal();
                } else {
                  window.location.href = '/master?tab=tariff';
                }
              }}
              style={{ backdropFilter: 'blur(4px)' }}
            >
                <div className="text-center px-4 py-6 lg:p-8 max-w-sm">
                  <p className="text-white text-base lg:text-xl font-semibold mb-2 underline">
                    Доступно в подписке Pro
                  </p>
                  <p className="text-gray-200 text-xs lg:text-sm underline">
                    Обновите подписку для доступа к расширенной статистике
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            {/* График бронирований */}
            <div className="rounded-2xl border border-[#E7E2DF]/90 bg-white p-4 shadow-[0_8px_32px_-20px_rgba(45,45,45,0.1)] ring-1 ring-[#2D2D2D]/[0.03] lg:rounded-[14px] lg:p-6 lg:shadow-[0_1px_2px_rgba(45,45,45,0.06)] lg:ring-0">
              <h3 className="mb-2 text-base font-semibold text-[#2D2D2D] lg:mb-4 lg:text-lg">Бронирования за период</h3>
            <div className="h-[220px] w-full lg:h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <ComposedChart data={stats.weeks_data} margin={{ top: 16, right: 16, bottom: 12, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="period_label"
                  tick={{ fontSize: 11, fill: '#6B6B6B' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E7E2DF' }}
                  tickFormatter={(value, index) =>
                    formatStatsAxisLabel(
                      stats.weeks_data[index]?.period_start,
                      stats.weeks_data[index]?.period_end,
                      value
                    )
                  }
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6B6B6B' }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip content={<CustomTooltip chartType="bookings" />} cursor={{ fill: 'rgba(76,175,80,0.06)' }} />
                <Bar stackId="bookings" dataKey="bookings_confirmed" fill="#4CAF50" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar stackId="bookings" dataKey="bookings_pending" fill="#C8E8D8" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </ComposedChart>
            </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] leading-tight text-[#4A4A4A]">
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#4CAF50]" aria-hidden />
                <span>Подтверждённые</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#C8E8D8]" aria-hidden />
                <span>Ожидают</span>
              </div>
            </div>
          </div>

          {/* График доходов */}
          <div className="rounded-2xl border border-[#E7E2DF]/90 bg-white p-4 shadow-[0_8px_32px_-20px_rgba(45,45,45,0.1)] ring-1 ring-[#2D2D2D]/[0.03] lg:rounded-[14px] lg:p-6 lg:shadow-[0_1px_2px_rgba(45,45,45,0.06)] lg:ring-0">
            <h3 className="mb-2 text-base font-semibold text-[#2D2D2D] lg:mb-4 lg:text-lg">Доход за период</h3>
            <div className="h-[220px] w-full lg:h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <ComposedChart data={stats.weeks_data} margin={{ top: 16, right: 16, bottom: 12, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="period_label"
                  tick={{ fontSize: 11, fill: '#6B6B6B' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E7E2DF' }}
                  tickFormatter={(value, index) =>
                    formatStatsAxisLabel(
                      stats.weeks_data[index]?.period_start,
                      stats.weeks_data[index]?.period_end,
                      value
                    )
                  }
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6B6B6B' }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip content={<CustomTooltip chartType="income" />} cursor={{ fill: 'rgba(76,175,80,0.06)' }} />
                <Bar stackId="income" dataKey="income_confirmed_rub" fill="#4CAF50" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Bar stackId="income" dataKey="income_pending_rub" fill="#C8E8D8" radius={[6, 6, 0, 0]} maxBarSize={36} />
              </ComposedChart>
            </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] leading-tight text-[#4A4A4A]">
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#4CAF50]" aria-hidden />
                <span>Подтверждённые</span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#C8E8D8]" aria-hidden />
                <span>Ожидают</span>
              </div>
            </div>
          </div>
        </div>
        </div>
      ) : null}
        </div>
      )}
        </div>
        <aside className="min-w-0 space-y-4 max-lg:order-2 lg:col-span-4 lg:space-y-4">
          {(balance || subscriptionStatus) && (() => {
            const planTitle =
              subscriptionStatus?.plan_display_name ||
              getPlanNameInRussian(subscriptionStatus?.plan_name) ||
              'Free';
            const daysRemaining =
              typeof subscriptionStatus?.days_remaining === 'number'
                ? subscriptionStatus.days_remaining
                : null;
            const balanceValue = balance
              ? balance.available_balance !== undefined
                ? balance.available_balance
                : balance.balance
              : null;
            const progressPct =
              daysRemaining != null
                ? Math.min(100, Math.max(0, Math.round((daysRemaining / 30) * 100)))
                : subscriptionStatus?.can_continue
                  ? 100
                  : 0;
            const isFrozen = Boolean(subscriptionStatus?.is_frozen);
            const statusLabel = isFrozen
              ? 'Приостановлена'
              : subscriptionStatus?.can_continue
                ? 'Активна'
                : 'Бесплатная';
            const statusTone = isFrozen
              ? 'text-amber-300'
              : subscriptionStatus?.can_continue
                ? 'text-[#A5D6A7]'
                : 'text-white/70';
            return (
              <div className="hidden overflow-hidden rounded-[18px] border border-white/10 bg-gradient-to-br from-[#1B1B1B] to-[#2D2D2D] p-4 text-white shadow-[0_24px_60px_-22px_rgba(45,45,45,0.28)] ring-1 ring-[#2D2D2D]/[0.04] lg:block">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A5D6A7]">
                      Аккаунт
                    </p>
                    <p className="mt-1 truncate text-[15px] font-semibold leading-tight text-white">
                      {planTitle}
                    </p>
                    <p className={`mt-0.5 text-[12px] font-medium leading-snug ${statusTone}`}>
                      {statusLabel}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-[10px] bg-white/15 p-2">
                    <BanknotesIcon className="h-5 w-5 text-white" strokeWidth={2} aria-hidden />
                  </div>
                </div>

                <div className="mt-2.5 flex items-center gap-2 rounded-[10px] bg-white/5 px-3 py-1.5 ring-1 ring-white/10">
                  <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-white/60">
                      Баланс
                    </span>
                    <span className="truncate text-[13px] font-semibold tabular-nums text-white">
                      {balanceValue != null ? formatMoney(balanceValue) : '—'}
                    </span>
                  </div>
                  <span className="h-3 w-px shrink-0 bg-white/15" aria-hidden />
                  <div className="flex min-w-0 flex-1 items-baseline justify-end gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-white/60">
                      Осталось
                    </span>
                    <span className="truncate text-[13px] font-semibold tabular-nums text-white">
                      {daysRemaining != null ? `${daysRemaining} дн.` : '—'}
                    </span>
                  </div>
                </div>

                <div className="mt-2.5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-[#4CAF50] transition-[width] duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {bookingsLimit && bookingsLimit.plan_name === 'Free' && (
                    <p className="mt-1.5 text-[11px] leading-snug text-white/70">
                      Активные записи: {bookingsLimit.current_active_bookings}/{bookingsLimit.max_future_bookings}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (onOpenSubscriptionModal) {
                      onOpenSubscriptionModal();
                    } else if (onOpenTariff) {
                      onOpenTariff();
                    }
                  }}
                  className="mt-2.5 w-full rounded-[10px] bg-white py-2 text-[13px] font-semibold text-[#1B1B1B] shadow-sm transition-colors hover:bg-white/90"
                >
                  Продлить / Апгрейд
                </button>
              </div>
            );
          })()}
          {(onOpenSchedule || onOpenTariff || onOpenSettings) && (
            <div className="hidden overflow-hidden rounded-[22px] border-2 border-[#E7E2DF] bg-gradient-to-b from-white to-[#F0EBE7] p-4 shadow-[0_20px_44px_-28px_rgba(28,25,23,0.4)] ring-2 ring-[#4CAF50]/15">
              <div className="mb-3 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#2E7D32]">Быстрые переходы</p>
                  <h4 className="mt-1 text-[17px] font-extrabold leading-tight text-[#1C1917]">Разделы кабинета</h4>
                </div>
              </div>
              <nav className="grid grid-cols-2 gap-3" aria-label="Быстрые действия">
                {onOpenSchedule && (
                  <button
                    type="button"
                    onClick={onOpenSchedule}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-[#E7E2DF] bg-white px-2 py-4 text-center shadow-[0_8px_20px_-12px_rgba(45,45,45,0.2)] transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-2"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#DFF5EC] to-[#B8E8D0] text-[#14532D] shadow-inner ring-2 ring-[#4CAF50]/25">
                      <CalendarDaysIcon className="h-7 w-7" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="text-[13px] font-extrabold leading-tight text-[#1C1917]">Расписание</span>
                    <span className="text-[10px] font-medium leading-snug text-[#78716C]">Неделя и записи</span>
                  </button>
                )}
                {onOpenTariff && (
                  <button
                    type="button"
                    onClick={onOpenTariff}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-[#E7E2DF] bg-white px-2 py-4 text-center shadow-[0_8px_20px_-12px_rgba(45,45,45,0.2)] transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-2"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E8F5E9] to-[#C8E6C9] text-[#14532D] shadow-inner ring-2 ring-[#4CAF50]/25">
                      <BanknotesIcon className="h-7 w-7" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="text-[13px] font-extrabold leading-tight text-[#1C1917]">Тарифы</span>
                    <span className="text-[10px] font-medium leading-snug text-[#78716C]">Подписка и лимиты</span>
                  </button>
                )}
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-[#E7E2DF] bg-white px-2 py-4 text-center shadow-[0_8px_20px_-12px_rgba(45,45,45,0.2)] transition active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50] focus-visible:ring-offset-2 ${onOpenSchedule && onOpenTariff && onOpenSettings ? 'col-span-2' : ''}`}
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F5F5F4] to-[#E7E5E4] text-[#44403C] shadow-inner ring-2 ring-[#A8A29E]/30">
                      <Cog6ToothIcon className="h-7 w-7" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="text-[13px] font-extrabold leading-tight text-[#1C1917]">Настройки</span>
                    <span className="text-[10px] font-medium leading-snug text-[#78716C]">Профиль и кабинет</span>
                  </button>
                )}
              </nav>
            </div>
          )}
          {(onOpenSchedule || onOpenTariff || onOpenSettings) && (
            <div className="hidden overflow-hidden rounded-[18px] border border-[#E7E2DF] bg-white px-4 py-3 shadow-[0_24px_60px_-22px_rgba(45,45,45,0.18)] ring-1 ring-[#2D2D2D]/[0.04] lg:block">
              <div className="mb-2 flex items-end justify-between gap-3 border-b border-[#E7E2DF]/70 pb-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#3D8B42]">Навигация</p>
                  <h4 className="mt-0.5 text-[14px] font-semibold leading-none tracking-tight text-[#2D2D2D]">Быстрые действия</h4>
                </div>
              </div>
              <nav className="flex flex-col gap-1.5" aria-label="Быстрые действия">
                {onOpenSchedule && (
                  <button
                    type="button"
                    onClick={onOpenSchedule}
                    className="group flex w-full items-center gap-3 rounded-[12px] border border-[#E7E2DF]/70 bg-gradient-to-b from-white to-[#FDFCFB] px-3 py-2 text-left shadow-[0_6px_20px_-16px_rgba(45,45,45,0.14)] transition hover:bg-[#F4F1EF] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50]/30 focus-visible:ring-offset-2"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#DFF5EC] text-[#3D8B42] ring-1 ring-[#4CAF50]/12 transition-colors group-hover:bg-[#C8E8D8]">
                      <CalendarDaysIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-[#2D2D2D]">
                      Расписание
                    </span>
                    <ChevronRightIcon
                      className="h-4 w-4 shrink-0 text-[#A0A0A0] transition-all group-hover:translate-x-0.5 group-hover:text-[#3D8B42]"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                )}
                {onOpenTariff && (
                  <button
                    type="button"
                    onClick={onOpenTariff}
                    className="group flex w-full items-center gap-3 rounded-[12px] border border-[#E7E2DF]/70 bg-gradient-to-b from-white to-[#FDFCFB] px-3 py-2 text-left shadow-[0_6px_20px_-16px_rgba(45,45,45,0.14)] transition hover:bg-[#F4F1EF] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50]/30 focus-visible:ring-offset-2"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#DFF5EC] text-[#3D8B42] ring-1 ring-[#4CAF50]/12 transition-colors group-hover:bg-[#C8E8D8]">
                      <BanknotesIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-[#2D2D2D]">
                      Тарифы
                    </span>
                    <ChevronRightIcon
                      className="h-4 w-4 shrink-0 text-[#A0A0A0] transition-all group-hover:translate-x-0.5 group-hover:text-[#3D8B42]"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                )}
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="group flex w-full items-center gap-3 rounded-[12px] border border-[#E7E2DF]/70 bg-gradient-to-b from-white to-[#FDFCFB] px-3 py-2 text-left shadow-[0_6px_20px_-16px_rgba(45,45,45,0.14)] transition hover:bg-[#F4F1EF] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4CAF50]/30 focus-visible:ring-offset-2"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#DFF5EC] text-[#3D8B42] ring-1 ring-[#4CAF50]/12 transition-colors group-hover:bg-[#C8E8D8]">
                      <Cog6ToothIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-[#2D2D2D]">
                      Настройки
                    </span>
                    <ChevronRightIcon
                      className="h-4 w-4 shrink-0 text-[#A0A0A0] transition-all group-hover:translate-x-0.5 group-hover:text-[#3D8B42]"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                )}
              </nav>
            </div>
          )}
          {/* Desktop: топ услуг в правом rail — возвращено на стабильное место */}
          <div className="hidden lg:block">
            {topServicesSectionDesktop}
          </div>
        </aside>
      </div>
    </div>
  );
}
