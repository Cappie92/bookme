import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { masterZClass } from '../config/masterOverlayZIndex';
import { useModal } from '../hooks/useModal';
import { useMasterOverlayScrollLock } from '../hooks/useMasterOverlayScrollLock';
import { apiGet, apiPost } from '../utils/api';
import {
  canCancelBooking,
  canConfirmPostVisit,
  canPreVisitConfirmBooking,
  CANCELLATION_REASONS,
  shouldSplitFutureBookingsByConfirmation,
} from '../utils/bookingOutcome';
import { formatDateShort, formatTimeShort } from '../utils/dateFormat';
import NotePopover from './ui/NotePopover';
import CancellationReasonPopover from './ui/CancellationReasonPopover';
import { useToast } from '../contexts/ToastContext';
import MasterBookingCardMobile from './master/mobile/MasterBookingCardMobile';
import MasterBookingDetailSheet from './master/mobile/MasterBookingDetailSheet';
import MasterBookingCancelSheet from './master/mobile/MasterBookingCancelSheet';
import {
  BookingStatusBadge,
  canMasterConfirmBooking,
  ClientDisplay,
  getBookingKey,
  isFutureCancelled,
  isFuturePending,
} from './master/mobile/masterBookingShared';

const PAGE_SIZE = 20;

const PAST_STATUS_OPTIONS = [
  { value: '', label: 'Все' },
  { value: 'completed', label: 'Завершено' },
  { value: 'cancelled', label: 'Отменено' },
  { value: 'confirmed', label: 'Подтверждено' },
  { value: 'created', label: 'Создано' },
  { value: 'awaiting_confirmation', label: 'На подтверждении' },
  { value: 'cancelled_by_client_early', label: 'Отмена клиентом (до)' },
  { value: 'cancelled_by_client_late', label: 'Отмена клиентом (после)' },
];

function formatDateForInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildPastAppointmentsUrl(page, limit, filters) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (filters?.status && filters.status.trim()) params.set('status', filters.status.trim());
  if (filters?.start_date && filters.start_date.trim()) params.set('start_date', filters.start_date.trim());
  if (filters?.end_date && filters.end_date.trim()) params.set('end_date', filters.end_date.trim());
  return `/api/master/past-appointments?${params.toString()}`;
}

function BookingRow({ booking, sectionType, masterSettings, actionBookingId, onConfirm, onCancelClick, onNoteClick, onCancellationReasonClick, hideActions, hasExtendedStats = false }) {
  const bookingDate = formatDateShort(booking.start_time || booking.date);
  const bookingTime = formatTimeShort(booking.start_time) || booking.time || '';
  const isCancelled = isFutureCancelled(booking.status);
  const master = masterSettings?.master ?? null;
  const showConfirm = !hideActions && !isCancelled && canMasterConfirmBooking(booking, master, hasExtendedStats);
  const showCancel = !hideActions && !isCancelled && canCancelBooking(booking);
  const isBusy = actionBookingId === booking.id;

  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-gray-100 last:border-b-0 text-sm group">
      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
        <span className="text-gray-500 shrink-0 w-14 text-xs">{bookingDate}</span>
        <span className="text-gray-500 shrink-0 w-9 text-xs">{bookingTime}</span>
        <span className="font-medium text-gray-900 min-w-0 truncate" style={{ maxWidth: '180px' }}>{booking.service_name}</span>
        <span className="min-w-0 flex-1 truncate flex items-center gap-1">
          {isCancelled && sectionType === 'future' && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">Отменено</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onCancellationReasonClick?.(booking, e); }}
                className="reason-trigger-btn text-red-600 hover:text-red-800 rounded p-0.5 cursor-pointer no-underline"
                title="Причина отмены"
                aria-label="Показать причину отмены"
              >
                <InformationCircleIcon className="w-4 h-4" />
              </button>
            </span>
          )}
          <ClientDisplay booking={booking} />
          {booking.has_client_note && (booking.client_note || '').trim() ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onNoteClick(booking, e); }}
              className="note-trigger-btn text-gray-900 hover:text-gray-700 hover:bg-gray-100 rounded p-0.5 shrink-0 cursor-pointer no-underline"
              title="Заметка"
            >
              <InformationCircleIcon className="w-4 h-4" />
            </button>
          ) : null}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <BookingStatusBadge sectionType={sectionType} booking={booking} master={masterSettings?.master ?? null} />
        {isCancelled && sectionType === 'past' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancellationReasonClick?.(booking, e); }}
            className="reason-trigger-btn text-red-600 hover:text-red-800 rounded p-0.5 cursor-pointer no-underline"
            title="Причина отмены"
            aria-label="Показать причину отмены"
          >
            <InformationCircleIcon className="w-4 h-4" />
          </button>
        )}
        {(showConfirm || showCancel) && (
          <div className="flex gap-1 opacity-70 group-hover:opacity-100">
            {showConfirm && (
              <button
                onClick={() => onConfirm(booking.id, booking)}
                disabled={isBusy}
                className="w-6 h-6 flex items-center justify-center bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-xs"
                aria-label="Подтвердить"
              >
                {isBusy ? '…' : <CheckIcon className="w-3.5 h-3.5" />}
              </button>
            )}
            {showCancel && (
              <button
                onClick={() => onCancelClick(booking.id)}
                disabled={isBusy}
                className="w-6 h-6 flex items-center justify-center border border-red-600 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                aria-label="Отменить"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BookingsFiltersPanel({ filters, onApply, onReset, onClose }) {
  const { handleBackdropClick, handleMouseDown } = useModal(onClose);
  const [draft, setDraft] = React.useState({ status: '', start_date: '', end_date: '' });
  React.useEffect(() => {
    setDraft({
      status: filters.status || '',
      start_date: filters.start_date || '',
      end_date: filters.end_date || '',
    });
  }, [filters]);

  const applyPreset = (preset) => {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);
    if (preset === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (preset === 'week') {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else {
      start.setMonth(start.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
    }
    setDraft((prev) => ({
      ...prev,
      start_date: formatDateForInput(start),
      end_date: formatDateForInput(end),
    }));
  };

  return (
    <div
      className={`fixed inset-0 ${masterZClass('nested')} flex items-center justify-center bg-black bg-opacity-50`}
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
      role="presentation"
    >
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="all-bookings-filters-title">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 id="all-bookings-filters-title" className="text-base font-semibold text-gray-900">Фильтры</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Закрыть"
          >
            <XMarkIcon className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Пресеты дат</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => applyPreset('today')} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded hover:bg-gray-50">Сегодня</button>
              <button type="button" onClick={() => applyPreset('week')} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded hover:bg-gray-50">Неделя</button>
              <button type="button" onClick={() => applyPreset('month')} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded hover:bg-gray-50">Месяц</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Дата начала</label>
            <input
              type="date"
              value={draft.start_date}
              onChange={(e) => setDraft((p) => ({ ...p, start_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Дата конца</label>
            <input
              type="date"
              value={draft.end_date}
              onChange={(e) => setDraft((p) => ({ ...p, end_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
            <select
              value={draft.status}
              onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded text-sm"
            >
              {PAST_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">Закрыть</button>
          <button type="button" onClick={() => onReset()} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded">Сбросить</button>
          <button type="button" onClick={() => onApply(draft)} className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded">Применить</button>
        </div>
      </div>
    </div>
  );
}

/** Пагинация: Prev / Next + input page + Apply. `embedded` — в шапке модалки: компактно на mobile, панель на lg. */
function PaginationControls({ page, totalPages, total, onPageChange, loading, embedded = false }) {
  const [inputPage, setInputPage] = useState(String(page));
  useEffect(() => setInputPage(String(page)), [page]);

  const handleApply = () => {
    const n = parseInt(inputPage, 10);
    if (Number.isFinite(n) && n >= 1 && n <= totalPages) onPageChange(n);
  };

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const wrapClass = embedded
    ? 'mt-0 flex flex-nowrap items-center gap-x-1 gap-y-0 overflow-x-auto text-[10px] text-gray-600 [-ms-overflow-style:none] [scrollbar-width:none] sm:text-[11px] [&::-webkit-scrollbar]:hidden lg:mt-0 lg:mb-0 lg:flex-wrap lg:overflow-visible lg:gap-2 lg:rounded-md lg:border lg:border-gray-200 lg:bg-gray-50/70 lg:px-2.5 lg:py-1.5 lg:text-sm'
    : 'mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-[11px] text-gray-600 lg:mb-3 lg:gap-2 lg:rounded-lg lg:border-0 lg:border-b lg:bg-gray-50/50 lg:px-3 lg:py-2 lg:text-sm';

  return (
    <div className={wrapClass}>
      <span className="shrink-0 font-medium text-gray-700 lg:hidden">Стр.</span>
      <span className="hidden shrink-0 font-medium text-gray-600 lg:inline">Страница:</span>
      <input
        type="number"
        min={1}
        max={totalPages || 1}
        value={inputPage}
        onChange={(e) => setInputPage(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleApply()}
        className={`shrink-0 rounded border border-gray-300 text-center tabular-nums lg:w-14 lg:px-2 lg:py-1 lg:text-sm ${
          embedded ? 'w-9 px-0.5 py-px text-[10px] sm:w-10 sm:text-[11px]' : 'w-11 px-1 py-0.5 text-[11px]'
        }`}
        disabled={loading}
        aria-label="Номер страницы"
      />
      <button
        type="button"
        onClick={handleApply}
        disabled={loading}
        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-green-700 hover:bg-green-50 disabled:opacity-50 lg:hidden"
      >
        OK
      </button>
      <button
        type="button"
        onClick={handleApply}
        disabled={loading}
        className="hidden shrink-0 rounded px-2 py-1 text-sm font-medium text-green-600 hover:bg-green-50 disabled:opacity-50 lg:inline"
      >
        Применить
      </button>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={!hasPrev || loading}
        className="inline-flex shrink-0 items-center justify-center rounded px-1.5 py-0.5 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 lg:hidden"
        aria-label="Предыдущая страница"
      >
        <ChevronLeftIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={!hasNext || loading}
        className="inline-flex shrink-0 items-center justify-center rounded px-1.5 py-0.5 text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 lg:hidden"
        aria-label="Следующая страница"
      >
        <ChevronRightIcon className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={!hasPrev || loading}
        className="hidden shrink-0 items-center gap-1 rounded px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 lg:inline-flex"
      >
        <ChevronLeftIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
        Назад
      </button>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={!hasNext || loading}
        className="hidden shrink-0 items-center gap-1 rounded px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 lg:inline-flex"
      >
        Вперёд
        <ChevronRightIcon className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      {total != null && (
        <span className="ml-auto shrink-0 text-[10px] text-gray-500 lg:ml-1 lg:text-xs">
          всего: {total}
        </span>
      )}
    </div>
  );
}

export default function AllBookingsModal({ isOpen, onClose, onConfirmSuccess, initialMode = 'future', hasExtendedStats = false }) {
  const { showToast } = useToast();
  const mode = initialMode === 'past' ? 'past' : 'future';
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [masterSettings, setMasterSettings] = useState(null);
  const [actionBookingId, setActionBookingId] = useState(null);
  const [cancelBookingId, setCancelBookingId] = useState(null);
  const [notePopover, setNotePopover] = useState(null);
  const [cancellationReasonPopover, setCancellationReasonPopover] = useState(null);
  const [pastFilters, setPastFilters] = useState({ status: '', start_date: '', end_date: '' });
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const [detailBooking, setDetailBooking] = useState(null);

  const { handleBackdropClick, handleMouseDown } = useModal(onClose);

  useMasterOverlayScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onLg = () => {
      if (mq.matches) {
        setDetailBooking(null);
        setFiltersPanelOpen(false);
      }
    };
    mq.addEventListener('change', onLg);
    return () => mq.removeEventListener('change', onLg);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (filtersPanelOpen) {
        setFiltersPanelOpen(false);
        return;
      }
      if (cancelBookingId) {
        setCancelBookingId(null);
        return;
      }
      if (detailBooking) {
        setDetailBooking(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, filtersPanelOpen, cancelBookingId, detailBooking, onClose]);

  const loadPage = useCallback(async (p = 1, appliedFilters = null) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setError('Необходима авторизация');
        return;
      }
      if (mode === 'future') {
        const data = await apiGet(`/api/master/bookings/future?page=${p}&limit=${PAGE_SIZE}`).catch((err) => {
          if (err?.response?.status === 401) {
            localStorage.removeItem('access_token');
            window.location.href = '/login';
            throw err;
          }
          return { bookings: [], total: 0, page: 1, limit: PAGE_SIZE, total_pages: 0 };
        });
        const bookings = (data?.bookings || []).map(b => ({
          ...b,
          isPast: false,
          start_time: b.start_time || `${b.date || ''}T${b.time || '00:00'}:00`,
        }));
        setItems(bookings);
        setTotal(data?.total ?? 0);
        setTotalPages(data?.total_pages ?? 0);
      } else {
        const filtersToUse = appliedFilters ?? pastFilters;
        const url = buildPastAppointmentsUrl(p, PAGE_SIZE, filtersToUse);
        const data = await apiGet(url).catch((err) => {
          if (err?.response?.status === 401) {
            localStorage.removeItem('access_token');
            window.location.href = '/login';
            throw err;
          }
          return { appointments: [], total: 0, page: 1, limit: PAGE_SIZE, pages: 0 };
        });
        const appointments = (data?.appointments || []).map(b => ({
          ...b,
          isPast: true,
          start_time: b.start_time || `${b.date || ''}T${b.time || '00:00'}:00`,
        }));
        setItems(appointments);
        setTotal(data?.total ?? 0);
        setTotalPages(data?.pages ?? data?.total_pages ?? 0);
        if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
          const cancelledCount = appointments.filter(x => /^cancelled/i.test(String(x.status || ''))).length;
          if (cancelledCount > 0) console.log('[AllBookingsModal] past page cancelled count:', cancelledCount);
        }
      }
    } catch (err) {
      setError('Ошибка сети');
    } finally {
      setLoading(false);
    }
  }, [mode, pastFilters]);

  useEffect(() => {
    if (isOpen) {
      loadMasterSettings();
      setPage(1);
      loadPage(1);
    } else {
      setItems([]);
      setDetailBooking(null);
      setCancelBookingId(null);
      setNotePopover(null);
      setCancellationReasonPopover(null);
      setFiltersPanelOpen(false);
      setActionBookingId(null);
    }
  }, [isOpen, mode, loadPage]);

  const loadMasterSettings = async () => {
    try {
      const data = await apiGet('/api/master/settings');
      setMasterSettings(data);
    } catch {
      // ignore
    }
  };

  const handlePageChange = useCallback((p) => {
    setPage(p);
    loadPage(p, mode === 'past' ? pastFilters : null);
  }, [loadPage, mode, pastFilters]);

  const handleApplyFilters = useCallback((filters) => {
    setPastFilters(filters);
    setPage(1);
    setFiltersPanelOpen(false);
    loadPage(1, filters);
  }, [loadPage]);

  const handleResetFilters = useCallback(() => {
    const empty = { status: '', start_date: '', end_date: '' };
    setPastFilters(empty);
    setPage(1);
    setFiltersPanelOpen(false);
    loadPage(1, empty);
  }, [loadPage]);

  const handleConfirm = async (bookingId, booking) => {
    const master = masterSettings?.master ?? null;
    const preVisit = canPreVisitConfirmBooking(booking, master, undefined, hasExtendedStats);
    const postVisit = canConfirmPostVisit(booking, master);
    if (!preVisit && !postVisit) {
      showToast('Подтверждение для этой записи недоступно', 'error');
      return;
    }
    try {
      setActionBookingId(bookingId);
      if (preVisit) {
        await apiPost(`/api/master/accounting/update-booking-status/${bookingId}?new_status=confirmed`);
        showToast('Принято', 'success', { quiet: true });
      } else {
        await apiPost(`/api/master/accounting/confirm-booking/${bookingId}`);
        showToast('Запись подтверждена', 'success');
      }
      loadPage(page);
      onConfirmSuccess?.();
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Ошибка при подтверждении записи', 'error');
    } finally {
      setActionBookingId(null);
    }
  };

  const handleCancelClick = (bookingId) => setCancelBookingId(bookingId);

  const handleNoteClick = useCallback((booking, e) => {
    e.stopPropagation();
    const key = getBookingKey(booking);
    setNotePopover((prev) => (prev?.key === key ? null : { content: booking.client_note || '', anchorRect: e.currentTarget.getBoundingClientRect(), key }));
  }, []);

  const handleCancellationReasonClick = useCallback((booking, e) => {
    e.stopPropagation();
    const reason = booking.cancellation_reason;
    const label = CANCELLATION_REASONS[reason] || reason || 'Причина не указана';
    setCancellationReasonPopover({
      content: label,
      anchorRect: e.currentTarget.getBoundingClientRect(),
    });
  }, []);

  const handleCancelWithReason = async (bookingId, reason) => {
    setCancelBookingId(null);
    if (!reason) return;
    try {
      setActionBookingId(bookingId);
      await apiPost(`/api/master/accounting/cancel-booking/${bookingId}?cancellation_reason=${reason}`);
      loadPage(page);
      onConfirmSuccess?.();
      showToast('Запись отменена', 'success');
      setDetailBooking(null);
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Ошибка при отмене записи', 'error');
    } finally {
      setActionBookingId(null);
    }
  };

  const handleConfirmFromSheet = async (bookingId, booking) => {
    try {
      await handleConfirm(bookingId, booking);
    } finally {
      setDetailBooking(null);
    }
  };

  const master = masterSettings?.master ?? null;
  const sectionType = mode;
  const splitFutureByConfirmation = shouldSplitFutureBookingsByConfirmation(master);

  const sortedItems = useMemo(() => {
    // Past: не пересортировывать — порядок уже GET /past-appointments (pending-first + start_time ↓).
    if (mode === 'past') {
      return [...items];
    }
    // Auto-confirm: один список по времени; отменённые в конец.
    if (!splitFutureByConfirmation) {
      return [...items].sort((a, b) => {
        const ca = isFutureCancelled(a.status) ? 1 : 0;
        const cb = isFutureCancelled(b.status) ? 1 : 0;
        if (ca !== cb) return ca - cb;
        return new Date(a.start_time || 0) - new Date(b.start_time || 0);
      });
    }
    // Manual: приоритет секций «На подтверждении» → «Подтверждённые» → отмена.
    return [...items].sort((a, b) => {
      const groupOrder = (x) => {
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

  if (!isOpen) return null;

  const title = mode === 'future' ? 'Будущие записи' : 'Прошедшие записи';
  const detailHideActions =
    detailBooking && mode === 'future' && isFutureCancelled(detailBooking.status);

  const modalLayer = (
    <div
      className={`fixed inset-0 ${masterZClass('allBookingsListModal')} isolate flex items-end justify-center bg-black/60 lg:items-center`}
      onClick={handleBackdropClick}
      onMouseDown={handleMouseDown}
    >
      <div
        className="relative z-[1] flex max-h-[100dvh] w-full max-w-full flex-col rounded-t-2xl bg-white pt-0 shadow-xl lg:mx-4 lg:max-h-[85vh] lg:max-w-3xl lg:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="all-bookings-modal-title"
      >
        <div className="shrink-0 space-y-1 border-b border-gray-200 bg-white px-2.5 pb-2 pt-[max(0.875rem,calc(10px+env(safe-area-inset-top,0px)))] lg:space-y-2 lg:px-5 lg:pb-3 lg:pt-4">
          <div className="flex items-center gap-2 lg:gap-3">
            <h2
              id="all-bookings-modal-title"
              className="order-2 min-w-0 flex-1 text-center text-sm font-semibold leading-snug text-gray-900 lg:order-1 lg:text-left lg:text-lg"
            >
              {title}
            </h2>
            <div className="order-3 flex shrink-0 items-center gap-1.5 lg:order-2">
              {mode === 'past' && (
                <button
                  type="button"
                  onClick={() => setFiltersPanelOpen(true)}
                  className="rounded-md px-2 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-50 lg:px-3 lg:py-1.5 lg:text-sm"
                >
                  Фильтры
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="order-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-gray-300 bg-white text-gray-800 shadow-md hover:bg-gray-50 hover:border-gray-400 lg:order-3 lg:h-10 lg:w-10 lg:rounded-full lg:border lg:border-gray-200 lg:bg-gray-100 lg:shadow-sm lg:hover:bg-gray-200"
              aria-label="Закрыть список записей"
            >
              <XMarkIcon className="h-6 w-6 lg:h-5 lg:w-5" strokeWidth={2.5} />
            </button>
          </div>
          <PaginationControls
            embedded
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={handlePageChange}
            loading={loading}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-1.5 pb-[max(6rem,calc(4.5rem+env(safe-area-inset-bottom,0px)))] lg:px-5 lg:py-3 lg:pb-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" />
              <p className="mt-2 text-sm text-gray-500">Загрузка...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-red-600 text-sm mb-4">{error}</p>
              <button onClick={() => loadPage(page)} className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Попробовать снова</button>
            </div>
          ) : sortedItems.length === 0 ? (
            <p className="text-center py-8 text-gray-500 text-sm">Нет записей</p>
          ) : futureGroups ? (
            <>
              <div className="space-y-4 lg:hidden">
                {futureGroups.pending.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">На подтверждении</h4>
                    <div className="space-y-2">
                      {futureGroups.pending.map((b) => (
                        <MasterBookingCardMobile
                          key={getBookingKey(b)}
                          booking={b}
                          sectionType={sectionType}
                          master={master}
                          hasExtendedStats={hasExtendedStats}
                          actionBookingId={actionBookingId}
                          onOpenDetail={setDetailBooking}
                          onConfirm={handleConfirm}
                          onCancelClick={handleCancelClick}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {futureGroups.confirmed.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Подтверждённые</h4>
                    <div className="space-y-2">
                      {futureGroups.confirmed.map((b) => (
                        <MasterBookingCardMobile
                          key={getBookingKey(b)}
                          booking={b}
                          sectionType={sectionType}
                          master={master}
                          hasExtendedStats={hasExtendedStats}
                          actionBookingId={actionBookingId}
                          onOpenDetail={setDetailBooking}
                          onConfirm={handleConfirm}
                          onCancelClick={handleCancelClick}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {futureGroups.cancelled.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">Отменено</h4>
                    <div className="space-y-2">
                      {futureGroups.cancelled.map((b) => (
                        <MasterBookingCardMobile
                          key={getBookingKey(b)}
                          booking={b}
                          sectionType={sectionType}
                          master={master}
                          hasExtendedStats={hasExtendedStats}
                          hideActions
                          actionBookingId={actionBookingId}
                          onOpenDetail={setDetailBooking}
                          onConfirm={handleConfirm}
                          onCancelClick={handleCancelClick}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="hidden space-y-4 lg:block">
                {futureGroups.pending.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-medium text-amber-700">На подтверждении</h4>
                    <div className="divide-y divide-gray-100">
                      {futureGroups.pending.map((b) => (
                        <BookingRow key={getBookingKey(b)} booking={b} sectionType={sectionType} masterSettings={masterSettings} actionBookingId={actionBookingId} onConfirm={handleConfirm} onCancelClick={handleCancelClick} onNoteClick={handleNoteClick} onCancellationReasonClick={handleCancellationReasonClick} hasExtendedStats={hasExtendedStats} />
                      ))}
                    </div>
                  </div>
                )}
                {futureGroups.confirmed.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-medium text-gray-600">Подтверждённые</h4>
                    <div className="divide-y divide-gray-100">
                      {futureGroups.confirmed.map((b) => (
                        <BookingRow key={getBookingKey(b)} booking={b} sectionType={sectionType} masterSettings={masterSettings} actionBookingId={actionBookingId} onConfirm={handleConfirm} onCancelClick={handleCancelClick} onNoteClick={handleNoteClick} onCancellationReasonClick={handleCancellationReasonClick} hasExtendedStats={hasExtendedStats} />
                      ))}
                    </div>
                  </div>
                )}
                {futureGroups.cancelled.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-medium text-red-600">Отменено</h4>
                    <div className="divide-y divide-gray-100">
                      {futureGroups.cancelled.map((b) => (
                        <BookingRow key={getBookingKey(b)} booking={b} sectionType={sectionType} masterSettings={masterSettings} actionBookingId={actionBookingId} onConfirm={handleConfirm} onCancelClick={handleCancelClick} onNoteClick={handleNoteClick} onCancellationReasonClick={handleCancellationReasonClick} hideActions hasExtendedStats={hasExtendedStats} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2 lg:hidden">
                {sortedItems.map((b) => (
                  <MasterBookingCardMobile
                    key={getBookingKey(b)}
                    booking={b}
                    sectionType={sectionType}
                    master={master}
                    hasExtendedStats={hasExtendedStats}
                    actionBookingId={actionBookingId}
                    onOpenDetail={setDetailBooking}
                    onConfirm={handleConfirm}
                    onCancelClick={handleCancelClick}
                  />
                ))}
              </div>
              <div className="hidden space-y-0 divide-y divide-gray-100 lg:block">
                {sortedItems.map((b) => (
                  <BookingRow
                    key={getBookingKey(b)}
                    booking={b}
                    sectionType={sectionType}
                    masterSettings={masterSettings}
                    actionBookingId={actionBookingId}
                    onConfirm={handleConfirm}
                    onCancelClick={handleCancelClick}
                    onNoteClick={handleNoteClick}
                    onCancellationReasonClick={handleCancellationReasonClick}
                    hasExtendedStats={hasExtendedStats}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {notePopover && (
          <div className="hidden lg:block">
            <NotePopover
              content={notePopover.content}
              anchorRect={notePopover.anchorRect}
              onClose={() => setNotePopover(null)}
            />
          </div>
        )}

        {cancellationReasonPopover && (
          <div className="hidden lg:block">
            <CancellationReasonPopover
              content={cancellationReasonPopover.content}
              anchorRect={cancellationReasonPopover.anchorRect}
              onClose={() => setCancellationReasonPopover(null)}
            />
          </div>
        )}

        {filtersPanelOpen && mode === 'past' && (
          <BookingsFiltersPanel
            filters={pastFilters}
            onApply={handleApplyFilters}
            onReset={handleResetFilters}
            onClose={() => setFiltersPanelOpen(false)}
          />
        )}

        {/* Mobile stack внутри корня модалки; desktop отмена — nested */}
        <div className="lg:hidden">
          <MasterBookingDetailSheet
            isOpen={!!detailBooking}
            booking={detailBooking}
            onClose={() => setDetailBooking(null)}
            sectionType={sectionType}
            master={master}
            hasExtendedStats={hasExtendedStats}
            hideActions={detailHideActions}
            actionBookingId={actionBookingId}
            onConfirm={handleConfirmFromSheet}
            onCancelRequest={(id) => setCancelBookingId(id)}
            disableEscapeKey
          />
          <MasterBookingCancelSheet
            isOpen={!!cancelBookingId}
            onClose={() => setCancelBookingId(null)}
            onSelectReason={(key) => handleCancelWithReason(cancelBookingId, key)}
            disableEscapeKey
          />
        </div>

        {cancelBookingId && (
          <div className={`fixed inset-0 ${masterZClass('nested')} hidden items-center justify-center bg-black/50 lg:flex`}>
            <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
              <h3 className="mb-3 text-base font-semibold">Причина отмены</h3>
              <div className="space-y-1">
                {Object.entries(CANCELLATION_REASONS).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleCancelWithReason(cancelBookingId, key)}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setCancelBookingId(null)}
                className="mt-3 w-full rounded px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return null;
  }
  return createPortal(modalLayer, document.body);
}
