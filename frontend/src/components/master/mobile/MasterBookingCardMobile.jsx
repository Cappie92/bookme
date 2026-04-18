import React from 'react';
import { CheckIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { formatDateShort, formatTimeShort } from '../../../utils/dateFormat';
import { canCancelBooking } from '../../../utils/bookingOutcome';
import { getStatusBadgeForPast } from '../../../utils/bookingStatusDisplay';
import { shouldSplitFutureBookingsByConfirmation } from '../../../utils/bookingOutcome';
import {
  canMasterConfirmBooking,
  isFutureCancelled,
  isFuturePending,
  MasterBookingClientBlockMobile,
  resolveBookingPriceDisplay,
} from './masterBookingShared';

const BRAND_GREEN = '#4CAF50';

const statusBadgeClass =
  'inline-flex max-w-full items-center justify-end whitespace-nowrap rounded px-1 py-0.5 text-[8px] font-semibold leading-none sm:text-[9px]';

/**
 * Компактная карточка как в mobile app (`BookingCardCompact`): первая строка — услуга + цена справа;
 * ниже клиент, затем дата·время; справа колонка статуса и действия (32×32).
 */
export default function MasterBookingCardMobile({
  booking,
  sectionType,
  master,
  hasExtendedStats = false,
  hideActions = false,
  actionBookingId,
  onOpenDetail,
  onConfirm,
  onCancelClick,
}) {
  const b = booking;
  const startRef = b.start_time || b.date;
  const dateStr = formatDateShort(startRef || b.date);
  const timeStart = formatTimeShort(b.start_time) || b.time || '';
  const timeEnd = b.end_time ? formatTimeShort(b.end_time) : '';
  const metaLine =
    timeEnd && timeStart ? `${dateStr} • ${timeStart}–${timeEnd}` : `${dateStr} • ${timeStart || '—'}`;

  const isCancelled = isFutureCancelled(b.status);
  const showConfirm =
    !hideActions && !isCancelled && canMasterConfirmBooking(b, master, hasExtendedStats);
  const showCancel = !hideActions && !isCancelled && canCancelBooking(b);
  const isBusy = actionBookingId === b.id;
  const hasNote = !!(b.has_client_note && (b.client_note || '').trim());
  const pastMeta = sectionType === 'past' ? getStatusBadgeForPast(b, master) : null;
  const priceLine = resolveBookingPriceDisplay(b);

  return (
    <article className="flex min-h-0 overflow-hidden rounded-lg border border-gray-200/50 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => onOpenDetail?.(b)}
        className="min-w-0 flex-1 px-2 py-1.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-50"
      >
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <p className="min-w-0 flex-1 pr-1 text-sm font-semibold leading-[1.2] text-gray-900 line-clamp-2">
            {b.service_name || '—'}
          </p>
          {priceLine ? (
            <span
              className="shrink-0 text-sm font-semibold tabular-nums leading-[1.2]"
              style={{ color: BRAND_GREEN }}
            >
              {priceLine}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 min-w-0 pr-1">
          <MasterBookingClientBlockMobile
            booking={b}
            noteSlot={
              hasNote ? (
                <span className="inline-flex" title="Есть заметка">
                  <InformationCircleIcon className="h-3.5 w-3.5 text-[#4CAF50]" strokeWidth={2} aria-hidden />
                </span>
              ) : null
            }
          />
        </div>
        <div className="mt-0.5 min-w-0 text-[11px] tabular-nums text-gray-500">
          <span className="block truncate pr-1">{metaLine}</span>
        </div>
      </button>
      <div className="flex min-w-[5.75rem] max-w-[7.5rem] shrink-0 flex-col self-stretch border-l border-gray-100/40 bg-white px-1 py-1 sm:min-w-[6rem] sm:max-w-[8rem]">
        <div className="flex shrink-0 flex-col items-end justify-center gap-0.5">
          {sectionType === 'future' &&
            shouldSplitFutureBookingsByConfirmation(master) &&
            isFuturePending(b.status) && (
            <span
              className={`${statusBadgeClass} bg-amber-50 text-amber-800`}
              title="На подтверждении"
            >
              На подтверждении
            </span>
          )}
          {sectionType === 'future' && isCancelled && (
            <span className={`${statusBadgeClass} bg-red-50 text-red-700`} title="Отменено">
              Отменено
            </span>
          )}
          {pastMeta ? (
            <span className={`${statusBadgeClass} ${pastMeta.cls}`} title={pastMeta.label}>
              {pastMeta.label}
            </span>
          ) : null}
        </div>
        {(showConfirm || showCancel) && (
          <div className="flex min-h-[2.5rem] flex-1 flex-row items-center justify-center gap-1 px-0.5">
            {showConfirm && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirm?.(b.id, b);
                }}
                disabled={isBusy}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4CAF50] text-white hover:bg-[#45a049] disabled:opacity-50"
                aria-label="Подтвердить"
              >
                {isBusy ? <span className="text-[10px]">…</span> : <CheckIcon className="h-4 w-4" strokeWidth={2.5} />}
              </button>
            )}
            {showCancel && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelClick?.(b.id);
                }}
                disabled={isBusy}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#F44336] bg-white text-[#F44336] hover:bg-red-50 disabled:opacity-50"
                aria-label="Отменить"
              >
                <XMarkIcon className="h-4 w-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
