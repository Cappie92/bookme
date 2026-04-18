import React from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { formatDateShort, formatTimeShort } from '../../../utils/dateFormat';
import { canCancelBooking, CANCELLATION_REASONS, shouldSplitFutureBookingsByConfirmation } from '../../../utils/bookingOutcome';
import {
  BookingStatusBadge,
  canMasterConfirmBooking,
  isFutureCancelled,
  isFuturePending,
  MasterBookingClientBlockMobile,
  resolveBookingPriceDisplay,
} from './masterBookingShared';
import { masterZClass } from '../../../config/masterOverlayZIndex';
import MasterActionSheet from './MasterActionSheet';

const DEFAULT_DETAIL_Z = masterZClass('bookingDetail');

/**
 * Детали записи (mobile-only слой). Логика действий — те же предикаты, что в BookingRow.
 */
export default function MasterBookingDetailSheet({
  isOpen,
  onClose,
  booking,
  sectionType,
  master,
  hasExtendedStats = false,
  hideActions = false,
  actionBookingId,
  onConfirm,
  onCancelRequest,
  /** Переопределение z-index (напр. расписание поверх вложенных sticky-слоёв) */
  zIndexClass,
  /** Родитель (AllBookingsModal / дашборд) обрабатывает Escape — не дублировать */
  disableEscapeKey = false,
}) {
  if (!isOpen || !booking) return null;

  const b = booking;
  const startRef = b.start_time || b.date;
  const dateStr = formatDateShort(startRef || b.date);
  const timeStr = formatTimeShort(b.start_time) || b.time || '';
  const isCancelled = isFutureCancelled(b.status);
  const showConfirm =
    !hideActions && !isCancelled && canMasterConfirmBooking(b, master, hasExtendedStats);
  const showCancel = !hideActions && !isCancelled && canCancelBooking(b);
  const isBusy = actionBookingId === b.id;

  const priceLabel = resolveBookingPriceDisplay(b);
  const durationMin = b.service_duration != null && b.service_duration !== '' ? Number(b.service_duration) : null;
  const reasonLabel =
    isCancelled && b.cancellation_reason
      ? CANCELLATION_REASONS[b.cancellation_reason] || b.cancellation_reason
      : null;

  const titleId = 'master-booking-detail-title';

  return (
    <MasterActionSheet
      isOpen={isOpen}
      onClose={onClose}
      title={b.service_name || 'Запись'}
      labelledBy={titleId}
      zIndexClass={zIndexClass ?? DEFAULT_DETAIL_Z}
      disableEscapeKey={disableEscapeKey}
    >
      <div className="space-y-4">
        <div>
          <p className="text-sm text-gray-500 tabular-nums">
            <span className="font-semibold text-gray-800">{dateStr}</span>
            <span className="mx-1 text-gray-300">·</span>
            <span>{timeStr}</span>
          </p>
          {sectionType === 'future' &&
            shouldSplitFutureBookingsByConfirmation(master) &&
            isFuturePending(b.status) && (
            <p className="mt-1 text-xs font-medium text-amber-800">Статус: на подтверждении</p>
          )}
          {sectionType === 'future' && isCancelled && (
            <p className="mt-1 text-xs font-medium text-red-700">Статус: отменено</p>
          )}
          <div className="mt-2 flex flex-nowrap items-center gap-2 overflow-x-auto">
            <BookingStatusBadge sectionType={sectionType} booking={b} master={master} />
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Клиент</h3>
          <div className="mt-1">
            <MasterBookingClientBlockMobile booking={b} size="comfortable" />
          </div>
        </div>

        {(priceLabel || (durationMin != null && Number.isFinite(durationMin))) && (
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Сумма</span>
              <p className="mt-0.5 font-medium text-gray-900">{priceLabel || '—'}</p>
            </div>
            {durationMin != null && Number.isFinite(durationMin) ? (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Длительность</span>
                <p className="mt-0.5 font-medium text-gray-900">{durationMin} мин</p>
              </div>
            ) : null}
          </div>
        )}

        {b.has_client_note && (b.client_note || '').trim() ? (
          <div className="rounded-xl bg-gray-50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Заметка</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{b.client_note}</p>
          </div>
        ) : null}

        {reasonLabel ? (
          <div className="rounded-xl border border-red-100 bg-red-50/80 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-red-800">Причина отмены</h3>
            <p className="mt-1 text-sm text-red-900">{reasonLabel}</p>
          </div>
        ) : null}

        {(showConfirm || showCancel) && (
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
            {showConfirm && (
              <button
                type="button"
                onClick={() => onConfirm?.(b.id, b)}
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                <CheckIcon className="h-5 w-5" />
                Подтвердить запись
              </button>
            )}
            {showCancel && (
              <button
                type="button"
                onClick={() => onCancelRequest?.(b.id)}
                disabled={isBusy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-red-500 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <XMarkIcon className="h-5 w-5" />
                Отменить запись
              </button>
            )}
          </div>
        )}
      </div>
    </MasterActionSheet>
  );
}
