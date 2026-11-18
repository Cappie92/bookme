import React from 'react'
import { CheckCircleIcon, GlobeAltIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { formatDateShort, formatTimeShort } from '../../utils/dateFormat'
import { canCancelBooking } from '../../utils/bookingOutcome'
import {
  BookingStatusBadge,
  canMasterConfirmBooking,
  MasterBookingClientBlockMobile,
  resolveBookingPriceDisplay,
  MasterBookingLoyaltyRubLine,
} from './mobile/masterBookingShared'
import { mcBtnDanger, mcBtnPrimary, mcBtnSecondary, mcFormTitle } from '../../utils/masterCabinetUi'
import { wallLabel } from '../../utils/calendarB3'

/**
 * Desktop online booking detail — Figma 88:3284 (read-only + confirm/cancel).
 */
export default function MasterBookingDetailAside({
  booking,
  master,
  hasExtendedStats = false,
  onClose,
  onConfirm,
  onCancelRequest,
  actionBookingId,
}) {
  if (!booking || booking.source === 'manual') return null

  const busy = actionBookingId === booking.id
  const showConfirm = canMasterConfirmBooking(booking, master, hasExtendedStats)
  const showCancel = canCancelBooking(booking)
  const dateStr = formatDateShort(booking.start_time || booking.date)
  const timeRange = wallLabel(booking.start_time, booking.end_time)
    || `${formatTimeShort(booking.start_time) || booking.time || ''}`.trim()
  const priceLabel = resolveBookingPriceDisplay(booking)
  const durationMin =
    booking.service_duration != null && booking.service_duration !== ''
      ? Number(booking.service_duration)
      : null

  const fieldLabel = 'text-[11px] font-semibold uppercase tracking-wide text-[var(--dedato-text-secondary,#5f6368)]'
  const fieldValue = 'mt-1 text-base font-semibold leading-6 text-[var(--dedato-text-primary,#2d2d2d)]'

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="master-booking-detail-aside"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className={mcFormTitle}>{booking.service_name || 'Онлайн-запись'}</h3>
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--dedato-text-secondary,#5f6368)] hover:bg-[var(--dedato-surface-subtle,#f3f4f6)]"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-[13px] text-[var(--dedato-event-online,#0f6d69)]">
          <GlobeAltIcon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-semibold">Онлайн</span>
          <BookingStatusBadge sectionType="future" booking={booking} master={master} />
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className={fieldLabel}>Дата и время</p>
            <p className={fieldValue}>
              {dateStr}
              {timeRange ? ` · ${timeRange}` : ''}
            </p>
          </div>

          <div>
            <p className={fieldLabel}>Клиент</p>
            <div className="mt-2">
              <MasterBookingClientBlockMobile booking={booking} size="comfortable" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className={fieldLabel}>Сумма</p>
              <p className={fieldValue}>{priceLabel || '—'}</p>
              <MasterBookingLoyaltyRubLine booking={booking} className="mt-1 text-[13px] font-medium text-[var(--dedato-status-success,#1b5e20)]" />
            </div>
            {durationMin != null && Number.isFinite(durationMin) ? (
              <div>
                <p className={fieldLabel}>Длительность</p>
                <p className={fieldValue}>{durationMin} мин</p>
              </div>
            ) : null}
          </div>

          {booking.has_client_note && (booking.client_note || '').trim() ? (
            <div className="rounded-[var(--dedato-radius-control,8px)] border border-[var(--dedato-border-decorative,#e7e2df)] bg-[var(--dedato-surface-subtle,#f3f4f6)] p-3">
              <p className={fieldLabel}>Заметка клиента</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[var(--dedato-text-primary,#2d2d2d)]">
                {booking.client_note}
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-2 text-[13px] text-[var(--dedato-status-success,#1b5e20)]">
            <CheckCircleIcon className="h-5 w-5 shrink-0" aria-hidden />
            Подтверждено
          </div>
        </div>
      </div>

      {(showConfirm || showCancel) ? (
        <div
          className="sticky bottom-0 border-t border-[var(--dedato-border-decorative,#e7e2df)] bg-[var(--dedato-surface-elevated,#fff)] px-6 py-4"
          data-testid="master-booking-detail-actions"
        >
          <div className="flex flex-col gap-2">
            {showConfirm ? (
              <button
                type="button"
                className={`${mcBtnPrimary} w-full`}
                disabled={busy}
                onClick={() => onConfirm?.(booking.id, booking)}
              >
                Подтвердить запись
              </button>
            ) : null}
            {showCancel ? (
              <button
                type="button"
                className={`${mcBtnDanger} w-full`}
                disabled={busy}
                onClick={() => onCancelRequest?.(booking.id)}
              >
                Отменить запись
              </button>
            ) : null}
            <button type="button" className={mcBtnSecondary} onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>
      ) : (
        <div className="sticky bottom-0 border-t border-[var(--dedato-border-decorative,#e7e2df)] bg-[var(--dedato-surface-elevated,#fff)] px-6 py-4">
          <button type="button" className={`${mcBtnSecondary} w-full`} onClick={onClose}>
            Закрыть
          </button>
        </div>
      )}
    </div>
  )
}
