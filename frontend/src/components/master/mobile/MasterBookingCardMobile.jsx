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

const statusBadgeBase =
  'inline-flex w-full max-w-full items-center justify-center overflow-hidden truncate whitespace-nowrap rounded-full font-extrabold leading-none shadow-sm';

/**
 * Карточка записи мастера (mobile).
 * @param {'default' | 'hub'} [variant] — `hub`: усиленная подача для mobile booking hub на дашборде.
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
  variant = 'default',
}) {
  const isHub = variant === 'hub';
  const b = booking;
  const startRef = b.start_time || b.date;
  const dateStr = formatDateShort(startRef || b.date);
  const timeStart = formatTimeShort(b.start_time) || b.time || '';
  const timeEnd = b.end_time ? formatTimeShort(b.end_time) : '';
  const stForMeta = b.start_time ? new Date(b.start_time) : null;
  const metaValid = stForMeta && !Number.isNaN(stForMeta.getTime());
  const dayPart = metaValid
    ? stForMeta.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
    : dateStr;
  const metaLine =
    timeEnd && timeStart ? `${dayPart} · ${timeStart}–${timeEnd}` : `${dayPart} · ${timeStart || '—'}`;

  const isCancelled = isFutureCancelled(b.status);
  const showConfirm =
    !hideActions && !isCancelled && canMasterConfirmBooking(b, master, hasExtendedStats);
  const showCancel = !hideActions && !isCancelled && canCancelBooking(b);
  const isBusy = actionBookingId === b.id;
  const hasNote = !!(b.has_client_note && (b.client_note || '').trim());
  const pastMeta = sectionType === 'past' ? getStatusBadgeForPast(b, master) : null;
  const priceLine = resolveBookingPriceDisplay(b);

  const isFutureConfirmed =
    sectionType === 'future' && !isCancelled && String(b.status || '').toLowerCase() === 'confirmed';

  const accentBar =
    sectionType === 'past'
      ? isHub
        ? 'border-l-[6px] border-l-stone-500'
        : 'border-l-[5px] border-l-[#A8A29E]'
      : isCancelled
        ? isHub
          ? 'border-l-[6px] border-l-red-500'
          : 'border-l-[5px] border-l-[#F87171]'
        : isFuturePending(b.status)
          ? isHub
            ? 'border-l-[6px] border-l-amber-400'
            : 'border-l-[5px] border-l-amber-400'
          : isHub
            ? 'border-l-[6px] border-l-[#22C55E]'
            : 'border-l-[5px] border-l-[#4CAF50]';

  const shell = isHub
    ? `relative flex min-h-0 overflow-hidden rounded-[22px] border-[3px] border-[#1C1917]/[0.08] bg-white shadow-[0_16px_40px_-20px_rgba(0,0,0,0.35)] ring-1 ring-[#4CAF50]/10 ${accentBar}`
    : `relative flex min-h-0 overflow-hidden rounded-2xl border-2 border-[#E4DED8] bg-white shadow-[0_10px_28px_-14px_rgba(28,25,23,0.28)] ring-1 ring-[#292524]/[0.06] ${accentBar}`;

  const titleCls = isHub
    ? 'min-w-0 flex-1 pr-1 text-[15px] font-black leading-[1.2] text-[#0C0A09] line-clamp-2'
    : 'min-w-0 flex-1 pr-1 text-[14px] font-extrabold leading-[1.25] text-[#1C1917] line-clamp-2';

  const priceCls = isHub
    ? 'shrink-0 text-[15px] font-black tabular-nums leading-[1.2]'
    : 'shrink-0 text-[14px] font-extrabold tabular-nums leading-[1.25]';

  const metaCls = isHub
    ? 'mt-0.5 min-w-0 text-[12px] font-semibold tabular-nums text-[#57534E]'
    : 'mt-0.5 min-w-0 text-[12px] font-medium tabular-nums text-[#78716C]';

  const statusSm = 'text-[10px] px-1.5 py-0.5';

  const rail = isHub
    ? 'flex w-[92px] min-w-[92px] shrink-0 flex-col items-center justify-between self-stretch gap-1 border-l-[3px] border-[#E7E2DF] bg-gradient-to-b from-[#FAFAF9] via-white to-[#F5F2EF] px-1 py-1.5'
    : 'flex w-[92px] min-w-[92px] shrink-0 flex-col items-center justify-between self-stretch gap-1 border-l-2 border-[#E7E2DF] bg-gradient-to-b from-[#FAFAF9] to-[#F5F2EF] px-1 py-1.5';

  let badgeNode = null;
  if (isFutureConfirmed) {
    badgeNode = (
      <span className={`${statusBadgeBase} ${statusSm} bg-[#F3F4F6] text-[#374151]`} title="Подтверждено">
        Подтверждено
      </span>
    );
  } else if (
    sectionType === 'future' &&
    shouldSplitFutureBookingsByConfirmation(master) &&
    isFuturePending(b.status)
  ) {
    badgeNode = (
      <span
        className={`${statusBadgeBase} ${statusSm} bg-amber-100 text-amber-950 ring-1 ring-amber-200/90`}
        title="На подтверждении"
      >
        Ожидает
      </span>
    );
  } else if (sectionType === 'future' && isCancelled) {
    badgeNode = (
      <span
        className={`${statusBadgeBase} ${statusSm} bg-red-100 text-red-900 ring-1 ring-red-200`}
        title="Отменено"
      >
        Отменено
      </span>
    );
  } else if (pastMeta) {
    badgeNode = (
      <span className={`${statusBadgeBase} ${statusSm} font-black ${pastMeta.cls}`} title={pastMeta.label}>
        {pastMeta.label}
      </span>
    );
  }

  const btnGo = isHub
    ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#16A34A] text-white shadow-[0_6px_14px_-6px_rgba(22,163,74,0.55)] ring-2 ring-[#4ADE80]/40 hover:bg-[#15803D] disabled:opacity-50'
    : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4CAF50] text-white shadow-[0_4px_12px_-4px_rgba(46,125,50,0.55)] ring-2 ring-[#4CAF50]/30 hover:bg-[#43A047] disabled:opacity-50';

  const btnCancel = isHub
    ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-red-200 bg-white text-[#DC2626] shadow-sm hover:bg-red-50 disabled:opacity-50'
    : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-[#FECACA] bg-white text-[#DC2626] shadow-sm hover:bg-red-50 disabled:opacity-50';

  return (
    <article className={shell}>
      <button
        type="button"
        onClick={() => onOpenDetail?.(b)}
        className={`min-w-0 flex-1 text-left transition-colors hover:bg-[#FAFAF9] active:bg-[#F5F5F4] ${
          isHub ? 'px-3 py-2' : 'px-3 py-1.5 sm:px-3 sm:py-2'
        }`}
      >
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <p className={titleCls}>{b.service_name || '—'}</p>
          {priceLine ? (
            <span className={priceCls} style={{ color: BRAND_GREEN }}>
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
                  <InformationCircleIcon
                    className="h-3.5 w-3.5 text-[#16A34A]"
                    strokeWidth={2}
                    aria-hidden
                  />
                </span>
              ) : null
            }
          />
        </div>
        <div className={metaCls}>
          <span className="block truncate pr-1">{metaLine}</span>
        </div>
      </button>
      <div className={rail}>
        <div className="flex w-full min-h-[18px] items-start justify-center">
          {badgeNode}
        </div>
        <div className="flex w-full min-h-[36px] flex-row items-center justify-center gap-1">
          {showConfirm && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onConfirm?.(b.id, b);
              }}
              disabled={isBusy}
              className={btnGo}
              aria-label="Подтвердить"
            >
              {isBusy ? (
                <span className="text-xs font-bold">…</span>
              ) : (
                <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
              )}
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
              className={btnCancel}
              aria-label="Отменить"
            >
              <XMarkIcon className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
