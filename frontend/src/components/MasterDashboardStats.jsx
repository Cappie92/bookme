import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChartBarIcon,
  CheckIcon,
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

export default function MasterDashboardStats({
  refreshTrigger = 0,
  dashboardOverlayResetKey = 0,
  settingsPayload = null,
  onNavigateToStats,
  onConfirmSuccess,
  subscriptionStatus,
  hasExtendedStats = false,
  onOpenSubscriptionModal,
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
    if (!settingsPayload) {
      loadMasterSettings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger, settingsPayload]);

  const loadPastBookings = async () => {
    try {
      setPastBookingsLoading(true);
      const data = await apiGet('/api/master/past-appointments?page=1&limit=3');
      setPastBookings(data.appointments || []);
    } catch (err) {
      console.error('Ошибка загрузки прошедших записей:', err);
    } finally {
      setPastBookingsLoading(false);
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

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 shadow-sm">
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

  return (
    <div className="space-y-4 lg:space-y-6">

      {/* Будущие записи - всегда показываем */}
      <div className="bg-white rounded-xl lg:rounded-lg px-3 py-3 sm:px-4 lg:p-6 shadow-sm border border-gray-100/80 lg:border-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3 sm:gap-3 lg:mb-4">
          <div className="min-w-0">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Ближайшие записи</h3>
            <p className="mt-0.5 text-[11px] text-gray-500 lg:hidden">До трёх ближайших визитов</p>
          </div>
          <button
            type="button"
            onClick={() => { setAllBookingsModalMode('future'); setShowAllBookingsModal(true); }}
            className="w-full sm:w-auto shrink-0 px-4 py-2.5 text-sm font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-600/30 rounded-lg transition-colors no-underline text-center"
          >
            Посмотреть все
          </button>
        </div>
        {stats.next_bookings_list && stats.next_bookings_list.length > 0 ? (
          (() => {
            const list = stats.next_bookings_list.map((b) => ({
              ...b,
              start_time: b.start_time || (b.date && b.time ? `${b.date}T${b.time}:00` : null),
            }));
            // Дашборд: только awaiting_confirmation, confirmed, created; без cancelled; ровно 3 ближайших
            // Сортировка СТРОГО по времени (start_time ASC), без группировки по статусу
            const sortForDashboardFuture = (arr) =>
              [...arr].sort((a, b) => new Date(a.start_time || 0) - new Date(b.start_time || 0));
            const eligible = list
              .filter((b) => !isFutureCancelled(b.status))
              .filter((b) => {
                const s = String(b.status || '').toLowerCase();
                return s === 'awaiting_confirmation' || s === 'confirmed' || s === 'created';
              });
            const dashboardList = sortForDashboardFuture(eligible).slice(0, 3);
            if (typeof __DEV__ !== 'undefined' && __DEV__ && dashboardList.length > 0) {
              const times = dashboardList.map((x) => ({ id: x.id, status: x.status, start_time: x.start_time }));
              const mono = dashboardList.every(
                (x, i) => i === 0 || new Date(x.start_time || 0) >= new Date(dashboardList[i - 1].start_time || 0)
              );
              console.debug('[MasterDashboardStats] Dashboard future (3):', times, 'monotonic:', mono);
            }
            const renderRow = (booking, index, hideActions = false) => {
              const b = { ...booking, start_time: booking.start_time || (booking.date && booking.time ? `${booking.date}T${booking.time}:00` : '') };
              const master = masterSettings?.master ?? null;
              const isCancelled = false; // дашборд не показывает cancelled
              const showPreVisit = !isCancelled && canPreVisitConfirmBooking(b, master, undefined, hasExtendedStats);
              const showCancel = !isCancelled && canCancelBooking(b);
              const dispName = (booking.client_display_name || booking.client_name || '').trim() || 'Клиент';
              const clientLabel = booking.client_phone ? `${dispName} (${booking.client_phone})` : dispName;
              // Always use start_time for date/time (same as modal); date/time may be absent from API
              const dateStr = b.start_time ? formatDateShort(b.start_time) : (() => { if (__DEV__ && booking.id) console.warn('[MasterDashboardStats] Empty start_time for booking', booking.id); return '—'; })();
              const timeStr = b.start_time ? (formatTimeShort(b.start_time) || booking.time || '') : (booking.time || '—');
              return (
                <div
                  className="flex flex-col gap-2.5 py-3.5 text-sm lg:flex-row lg:items-center lg:justify-between lg:gap-2 lg:py-2 lg:border-0"
                >
                  <div className="flex flex-col gap-1 min-w-0 lg:flex-row lg:flex-nowrap lg:items-center lg:gap-3 lg:flex-1 lg:overflow-hidden">
                    <div className="flex items-baseline gap-2 text-xs text-gray-500 tabular-nums shrink-0">
                      <span className="font-semibold text-gray-700">{dateStr}</span>
                      <span className="text-gray-300" aria-hidden>·</span>
                      <span>{timeStr}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 leading-snug break-words lg:font-medium lg:truncate lg:max-w-[180px]">
                      {booking.service_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 min-w-0 lg:flex-1 lg:justify-end">
                    <span className="text-gray-600 min-w-0 text-sm leading-snug break-words line-clamp-2 lg:truncate lg:text-sm lg:text-gray-500 flex items-start gap-1 lg:items-center lg:flex-1">
                      {clientLabel}
                      {booking.has_client_note && (booking.client_note || '').trim() ? (
                        <button type="button" onClick={(e) => handleNoteClick(booking, e)} className="note-trigger-btn text-gray-900 hover:text-gray-700 hover:bg-gray-100 rounded p-0.5 shrink-0 cursor-pointer no-underline" title="Заметка">
                          <InformationCircleIcon className="w-4 h-4" />
                        </button>
                      ) : null}
                    </span>
                    {(showPreVisit || showCancel) ? (
                      <div className="flex gap-1 shrink-0">
                        {showPreVisit && (
                          <button
                            type="button"
                            onClick={() => handleConfirmPreVisit(booking.id)}
                            disabled={confirmLoading}
                            className="w-9 h-9 lg:w-7 lg:h-7 flex items-center justify-center bg-green-600 text-white rounded-lg lg:rounded hover:bg-green-700 disabled:opacity-50"
                            aria-label="Подтвердить"
                          >
                            {confirmLoading ? <span className="text-xs">...</span> : <CheckIcon className="w-4 h-4" />}
                          </button>
                        )}
                        {showCancel && (
                          <button
                            type="button"
                            onClick={() => handleCancelClick(booking)}
                            disabled={cancelLoading}
                            className="w-9 h-9 lg:w-7 lg:h-7 flex items-center justify-center border border-red-600 text-red-600 rounded-lg lg:rounded hover:bg-red-50 disabled:opacity-50"
                            aria-label="Отменить"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            };
            return (
              <>
                <ul className="list-none m-0 space-y-1 p-0 lg:hidden">
                  {dashboardList.map((b, i) => {
                    const normalized = {
                      ...b,
                      start_time: b.start_time || (b.date && b.time ? `${b.date}T${b.time}:00` : ''),
                    };
                    return (
                      <li key={b.id || i} className="m-0 p-0">
                        <MasterBookingCardMobile
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
                <ul className="hidden list-none divide-y divide-gray-100 m-0 p-0 lg:block">
                  {dashboardList.map((b, i) => (
                    <li key={b.id || i} className="m-0 p-0">
                      {renderRow(b, i, false)}
                    </li>
                  ))}
                </ul>
              </>
            );
          })()
        ) : (
          <p className="text-gray-500 text-center py-4">Нет предстоящих записей</p>
        )}
      </div>

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

      {/* Прошедшие записи - всегда показываем */}
      <div className="bg-white rounded-xl lg:rounded-lg px-3 py-3 sm:px-4 lg:p-6 shadow-sm border border-gray-100/80 lg:border-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3 sm:gap-3 lg:mb-4">
          <div className="min-w-0">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900">Прошедшие записи</h3>
            <p className="mt-0.5 text-[11px] text-gray-500 lg:hidden">Последние визиты из истории</p>
          </div>
          <button
            type="button"
            onClick={() => { setAllBookingsModalMode('past'); setShowAllBookingsModal(true); }}
            className="w-full sm:w-auto shrink-0 px-4 py-2.5 text-sm font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-600/30 rounded-lg transition-colors no-underline text-center"
          >
            Посмотреть все
          </button>
        </div>
        {pastBookingsLoading ? (
          <p className="text-gray-500 text-center py-4">Загрузка...</p>
        ) : pastBookings.length > 0 ? (
          <>
            <ul className="list-none m-0 space-y-1 p-0 lg:hidden">
              {pastBookings.map((booking) => {
                const b = {
                  ...booking,
                  start_time: booking.start_time || (booking.date && booking.time ? `${booking.date}T${booking.time}:00` : ''),
                };
                return (
                  <li key={booking.id} className="m-0 p-0">
                    <MasterBookingCardMobile
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
            <ul className="hidden list-none divide-y divide-gray-100 m-0 p-0 lg:block">
              {pastBookings.map((booking) => {
                const b = { ...booking, start_time: booking.start_time || (booking.date && booking.time ? `${booking.date}T${booking.time}:00` : '') };
                const showConfirm = canConfirmPostVisit(b, masterSettings?.master ?? null);
                const showCancel = canCancelBooking(b);
                const dispName = (booking.client_display_name || booking.client_name || '').trim() || 'Клиент';
                const clientLabel = booking.client_phone ? `${dispName} (${booking.client_phone})` : dispName;
                return (
                  <li key={booking.id} className="m-0 p-0">
                    <div className="flex flex-col gap-2.5 py-3.5 text-sm lg:flex-row lg:items-center lg:justify-between lg:gap-2 lg:py-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden lg:flex-row lg:flex-nowrap lg:items-center lg:gap-3">
                        <div className="flex shrink-0 items-baseline gap-2 text-xs text-gray-500 tabular-nums">
                          <span className="font-semibold text-gray-700">{formatDateShort(booking.date)}</span>
                          <span className="text-gray-300" aria-hidden>
                            ·
                          </span>
                          <span>{booking.time}</span>
                        </div>
                        <span className="max-w-[180px] break-words text-sm font-semibold leading-snug text-gray-900 lg:truncate lg:font-medium">
                          {booking.service_name}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:flex-1 lg:justify-end">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          {(() => {
                            const meta = getStatusBadgeForPast(b, masterSettings?.master ?? null);
                            return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${meta.cls}`}>{meta.label}</span>;
                          })()}
                          <span className="flex min-w-0 flex-1 items-start gap-1 break-words text-sm leading-snug text-gray-600 line-clamp-2 sm:flex-1 lg:max-w-none lg:truncate lg:text-sm lg:text-gray-500 lg:items-center">
                            {clientLabel}
                            {booking.has_client_note && (booking.client_note || '').trim() ? (
                              <button
                                type="button"
                                onClick={(e) => handleNoteClick(booking, e)}
                                className="note-trigger-btn shrink-0 cursor-pointer rounded p-0.5 text-gray-900 no-underline hover:bg-gray-100 hover:text-gray-700"
                                title="Заметка"
                              >
                                <InformationCircleIcon className="h-4 w-4" />
                              </button>
                            ) : null}
                          </span>
                        </div>
                        {showConfirm || showCancel ? (
                          <div className="flex shrink-0 gap-1 self-end sm:self-center">
                            {showConfirm && (
                              <button
                                type="button"
                                onClick={() => handleConfirmPostVisit(booking.id)}
                                disabled={confirmLoading}
                                className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 lg:h-7 lg:w-7 lg:rounded"
                                aria-label="Подтвердить"
                              >
                                {confirmLoading ? <span className="text-xs">...</span> : <CheckIcon className="h-4 w-4" />}
                              </button>
                            )}
                            {showCancel && (
                              <button
                                type="button"
                                onClick={() => handleCancelClick(booking)}
                                disabled={cancelLoading}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-600 text-red-600 hover:bg-red-50 disabled:opacity-50 lg:h-7 lg:w-7 lg:rounded"
                                aria-label="Отменить"
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="text-gray-500 text-center py-4">Нет прошедших записей</p>
        )}
      </div>

      {/* Статистика услуг - объединенный блок с переключателем */}
      <div className="bg-white rounded-xl lg:rounded-lg p-4 lg:p-6 shadow-sm border border-gray-100/80 lg:border-0">
        <div className="flex flex-col gap-3 mb-3 lg:flex-row lg:items-center lg:justify-between lg:mb-4">
          <h3 className="text-base lg:text-lg font-semibold text-gray-900 leading-snug">
            Топ услуг {stats.top_period_range ? <span className="text-gray-500 font-normal">({stats.top_period_range})</span> : null}
          </h3>
          <div className="flex w-full bg-gray-100 rounded-lg p-1 lg:w-auto lg:shrink-0">
            <button
              type="button"
              onClick={() => setServicesStatsTab('bookings')}
              className={`flex-1 lg:flex-none px-3 py-2 lg:py-1 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-100 ${
                servicesStatsTab === 'bookings'
                  ? 'bg-white text-green-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              По записям
            </button>
            <button
              type="button"
              onClick={() => setServicesStatsTab('earnings')}
              className={`flex-1 lg:flex-none px-3 py-2 lg:py-1 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-100 ${
                servicesStatsTab === 'earnings'
                  ? 'bg-white text-green-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              По доходу
            </button>
          </div>
        </div>
        <div className="space-y-1.5 lg:space-y-2">
          {servicesStatsTab === 'bookings' ? (
            stats.top_services_by_bookings && stats.top_services_by_bookings.length > 0 ? (
              stats.top_services_by_bookings.slice(0, 5).map((service, index) => (
                <div key={service.service_id} className="flex items-center justify-between gap-2 px-2.5 py-2 bg-gray-50 rounded-lg lg:rounded">
                  <div className="flex items-center min-w-0">
                    <span className="text-base lg:text-lg font-bold text-green-600 mr-2 shrink-0 w-7">#{index + 1}</span>
                    <span className="font-medium text-gray-900 text-sm truncate">{stripIndiePrefix(service.service_name)}</span>
                  </div>
                  <span className="text-xs lg:text-sm text-gray-600 shrink-0 tabular-nums">{service.booking_count} записей</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4 text-sm">Нет данных за период</p>
            )
          ) : (
            stats.top_services_by_earnings && stats.top_services_by_earnings.length > 0 ? (
              stats.top_services_by_earnings.slice(0, 5).map((service, index) => (
                <div key={service.service_id} className="flex items-center justify-between gap-2 px-2.5 py-2 bg-gray-50 rounded-lg lg:rounded">
                  <div className="flex items-center min-w-0">
                    <span className="text-base lg:text-lg font-bold text-green-600 mr-2 shrink-0 w-7">#{index + 1}</span>
                    <span className="font-medium text-gray-900 text-sm truncate">{stripIndiePrefix(service.service_name)}</span>
                  </div>
                  <span className="text-xs lg:text-sm text-gray-600 shrink-0 tabular-nums">{Math.round(service.total_earnings).toLocaleString('ru-RU')} ₽</span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4 text-sm">Нет данных за период</p>
            )
          )}
        </div>
      </div>

      {/* Гистограммы: mobile — свёрнуты по умолчанию (state); desktop — всегда видны через lg:block, без matchMedia */}
      {stats.weeks_data && stats.weeks_data.length > 0 && (
        <div className="space-y-4 lg:space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:gap-3">
            <h2 className="text-lg lg:text-xl font-semibold text-gray-900">Статистика за неделю</h2>
            <div className="flex flex-row items-stretch gap-2 sm:flex-wrap sm:justify-end lg:gap-3">
              <button
                type="button"
                onClick={() => setChartsExpanded((v) => !v)}
                className="lg:hidden inline-flex min-h-[40px] min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 bg-gray-50/90 px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-100"
              >
                <ChartBarIcon className="h-3.5 w-3.5 shrink-0 text-gray-600" strokeWidth={2} aria-hidden />
                <span className="truncate">{chartsExpanded ? 'Скрыть графики' : 'Показать графики'}</span>
              </button>
              <button
                type="button"
                onClick={onNavigateToStats}
                className="inline-flex min-h-[40px] min-w-0 flex-1 items-center justify-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 shadow-sm hover:bg-gray-50 sm:flex-initial lg:min-h-0 lg:flex-none lg:rounded-lg lg:border-transparent lg:bg-green-600 lg:px-4 lg:py-2.5 lg:text-sm lg:font-medium lg:text-white lg:shadow-none lg:hover:bg-green-700"
              >
                <PresentationChartLineIcon
                  className="h-3.5 w-3.5 shrink-0 text-gray-600 lg:h-5 lg:w-5 lg:text-white"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="truncate">Раздел «Статистика»</span>
              </button>
            </div>
          </div>

          <div
            ref={chartsAnchorRef}
            className={`relative ${chartsExpanded ? '' : 'hidden'} lg:block`}
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            {/* График бронирований (слева) */}
            <div className="bg-white rounded-xl lg:rounded-lg p-4 lg:p-6 shadow-sm border border-gray-100/80 lg:border-0">
              <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-2 lg:mb-4">Бронирования за период</h3>
            <div className="h-[220px] w-full lg:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={stats.weeks_data} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="period_label"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Период', position: 'insideBottom', offset: -10, fontSize: 11 }}
                  tickFormatter={(value, index) =>
                    formatStatsAxisLabel(
                      stats.weeks_data[index]?.period_start,
                      stats.weeks_data[index]?.period_end,
                      value
                    )
                  }
                />
                <YAxis 
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Количество', angle: -90, position: 'insideLeft', fontSize: 11 }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Изменение %', angle: 90, position: 'insideRight', fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip chartType="bookings" />} />
                <Bar yAxisId="left" stackId="bookings" dataKey="bookings_confirmed" radius={[0, 0, 0, 0]}>
                  {stats.weeks_data.map((entry, index) => (
                    <Cell key={`bc-${index}`} fill={stackSegmentFills(entry).confirmed} />
                  ))}
                </Bar>
                <Bar yAxisId="left" stackId="bookings" dataKey="bookings_pending" radius={[8, 8, 0, 0]}>
                  {stats.weeks_data.map((entry, index) => (
                    <Cell key={`bp-${index}`} fill={stackSegmentFills(entry).pending} />
                  ))}
                </Bar>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="bookings_change"
                  stroke={MASTER_STATS_CHANGE_LINE_STROKE}
                  strokeWidth={2}
                  dot={{ fill: MASTER_STATS_CHANGE_LINE_DOT, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-nowrap justify-center gap-x-1.5 overflow-x-auto px-0.5 text-[10px] leading-tight text-gray-700 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-x-2 sm:text-[11px] lg:mt-4 lg:flex-wrap lg:gap-x-4 lg:gap-y-2 lg:overflow-visible lg:px-0 lg:text-sm [&::-webkit-scrollbar]:hidden">
              <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                <div className="h-2.5 w-2.5 shrink-0 rounded bg-green-500 lg:h-3 lg:w-3" />
                <span className="whitespace-nowrap">
                  <span className="lg:hidden">Сейчас</span>
                  <span className="hidden lg:inline">Текущий период</span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                <div className="h-2.5 w-2.5 shrink-0 rounded bg-gray-400 lg:h-3 lg:w-3" />
                <span className="whitespace-nowrap">
                  <span className="lg:hidden">Прошлые</span>
                  <span className="hidden lg:inline">Прошлые периоды</span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                <div className="h-2.5 w-2.5 shrink-0 rounded bg-blue-400 lg:h-3 lg:w-3" />
                <span className="whitespace-nowrap">
                  <span className="lg:hidden">Будущие</span>
                  <span className="hidden lg:inline">Будущие периоды</span>
                </span>
              </div>
            </div>
          </div>

          {/* График доходов (справа) */}
          <div className="bg-white rounded-xl lg:rounded-lg p-4 lg:p-6 shadow-sm border border-gray-100/80 lg:border-0">
            <h3 className="text-base lg:text-lg font-semibold text-gray-900 mb-2 lg:mb-4">Доход за период</h3>
            <div className="h-[220px] w-full lg:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={stats.weeks_data} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="period_label"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Период', position: 'insideBottom', offset: -10, fontSize: 11 }}
                  tickFormatter={(value, index) =>
                    formatStatsAxisLabel(
                      stats.weeks_data[index]?.period_start,
                      stats.weeks_data[index]?.period_end,
                      value
                    )
                  }
                />
                <YAxis 
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Рубли', angle: -90, position: 'insideLeft', fontSize: 11 }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Изменение %', angle: 90, position: 'insideRight', fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip chartType="income" />} />
                <Bar yAxisId="left" stackId="income" dataKey="income_confirmed_rub" radius={[0, 0, 0, 0]}>
                  {stats.weeks_data.map((entry, index) => (
                    <Cell key={`ic-${index}`} fill={stackSegmentFills(entry).confirmed} />
                  ))}
                </Bar>
                <Bar yAxisId="left" stackId="income" dataKey="income_pending_rub" radius={[8, 8, 0, 0]}>
                  {stats.weeks_data.map((entry, index) => (
                    <Cell key={`ip-${index}`} fill={stackSegmentFills(entry).pending} />
                  ))}
                </Bar>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="income_change"
                  stroke={MASTER_STATS_CHANGE_LINE_STROKE}
                  strokeWidth={2}
                  dot={{ fill: MASTER_STATS_CHANGE_LINE_DOT, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-nowrap justify-center gap-x-1.5 overflow-x-auto px-0.5 text-[10px] leading-tight text-gray-700 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-x-2 sm:text-[11px] lg:mt-4 lg:flex-wrap lg:gap-x-4 lg:gap-y-2 lg:overflow-visible lg:px-0 lg:text-sm [&::-webkit-scrollbar]:hidden">
              <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                <div className="h-2.5 w-2.5 shrink-0 rounded bg-green-500 lg:h-3 lg:w-3" />
                <span className="whitespace-nowrap">
                  <span className="lg:hidden">Сейчас</span>
                  <span className="hidden lg:inline">Текущий период</span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                <div className="h-2.5 w-2.5 shrink-0 rounded bg-gray-400 lg:h-3 lg:w-3" />
                <span className="whitespace-nowrap">
                  <span className="lg:hidden">Прошлые</span>
                  <span className="hidden lg:inline">Прошлые периоды</span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1 lg:gap-2">
                <div className="h-2.5 w-2.5 shrink-0 rounded bg-blue-400 lg:h-3 lg:w-3" />
                <span className="whitespace-nowrap">
                  <span className="lg:hidden">Будущие</span>
                  <span className="hidden lg:inline">Будущие периоды</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
      )}
    </div>
  );
}
