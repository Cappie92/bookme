import React from 'react';
import { canConfirmPostVisit, canPreVisitConfirmBooking, isFuturePendingConfirmationStatus } from '../../../utils/bookingOutcome';
import { getStatusBadgeForPast } from '../../../utils/bookingStatusDisplay';
import { formatMoney } from '../../../utils/formatMoney';

/**
 * Единый допуск к действию «Подтвердить» (карточка, detail sheet, строка таблицы, handler).
 * Совпадает с OR из BookingRow / MasterBookingCardMobile — без дублирования ветвления в handleConfirm.
 */
export function canMasterConfirmBooking(booking, master, hasExtendedStats = false) {
  if (!booking) return false;
  return (
    canPreVisitConfirmBooking(booking, master, undefined, hasExtendedStats) ||
    canConfirmPostVisit(booking, master)
  );
}

export const BRAND_GREEN = '#4CAF50';

export function getBookingKey(b) {
  const id = b?.id ?? 'n';
  const st = (b?.start_time ?? b?.date ?? '').toString().replace(/\s/g, '');
  const cid = b?.client_id ?? b?.client_phone ?? '';
  return `${id}-${st}-${cid}`;
}

export function isFuturePending(status) {
  return isFuturePendingConfirmationStatus(status);
}

export function isFutureCancelled(status) {
  const s = String(status || '').toLowerCase();
  return s === 'cancelled' || s === 'cancelled_by_client_early' || s === 'cancelled_by_client_late';
}

/**
 * Цена для карточек/детали: payment_amount → service_price → price → amount;
 * сначала ищем положительное значение, иначе первое конечное число (в т.ч. 0).
 */
export function resolveBookingPriceDisplay(booking) {
  if (!booking) return null;
  const keys = ['payment_amount', 'service_price', 'price', 'amount'];
  const candidates = keys.map((k) => booking[k]);
  for (const raw of candidates) {
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return formatMoney(n);
  }
  for (const raw of candidates) {
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return formatMoney(n);
  }
  return null;
}

/**
 * Mobile: единый формат — строка имени (alias зелёным), ниже телефон; без имени — телефон или fallback.
 * @param {'compact'|'comfortable'} size
 */
export function MasterBookingClientBlockMobile({ booking, noteSlot = null, size = 'compact' }) {
  const phone = (booking?.client_phone || '').trim();
  const alias = (booking?.client_master_alias || '').trim();
  const account = (booking?.client_account_name || '').trim();
  const legacy = (booking?.client_display_name || booking?.client_name || '').trim();
  const legacyDistinct = legacy && legacy !== phone ? legacy : '';
  const nameLine = alias || account || legacyDistinct;
  const nameSize = size === 'comfortable' ? 'text-base font-semibold' : 'text-[11px] font-semibold';
  const phoneSize = size === 'comfortable' ? 'text-sm' : 'text-[10px]';
  const nameStyle = alias ? { color: BRAND_GREEN } : undefined;
  const nameColorCls = alias ? '' : 'text-gray-900';

  let content;
  if (nameLine && phone) {
    // Имя и телефон в одной строке: имя акцентом, разделитель и телефон слабее.
    content = (
      <span className={`block truncate leading-tight ${nameSize}`}>
        <span className={nameColorCls} style={nameStyle}>{nameLine}</span>
        <span className="mx-1 font-normal text-gray-400">·</span>
        <span className={`font-normal tabular-nums text-gray-500 ${phoneSize}`}>{phone}</span>
      </span>
    );
  } else if (nameLine) {
    content = (
      <span className={`block truncate leading-tight ${nameSize} ${nameColorCls}`} style={nameStyle}>
        {nameLine}
      </span>
    );
  } else if (phone) {
    content = (
      <span className={`block truncate leading-tight tabular-nums text-gray-900 ${nameSize}`}>{phone}</span>
    );
  } else {
    content = (
      <span className={`block truncate leading-tight text-gray-500 ${nameSize}`}>Клиент не указан</span>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0 flex-1">{content}</div>
      {noteSlot ? <span className="shrink-0">{noteSlot}</span> : null}
    </div>
  );
}

/** Имя клиента: alias (зелёное) или account/phone — как в AllBookingsModal */
export function ClientDisplay({ booking, className = '' }) {
  const hasMasterAlias = !!(booking.client_master_alias || '').trim();
  if (hasMasterAlias) {
    return <span className={className} style={{ color: BRAND_GREEN }}>{booking.client_master_alias}</span>;
  }
  const accountName = (booking.client_account_name || '').trim();
  const phone = (booking.client_phone || '').trim();
  const display = accountName || phone || '—';
  return (
    <span className={className}>
      {accountName ? <span className="text-gray-900">{accountName}</span> : null}
      {accountName && phone ? <span className="text-gray-400 mx-1">·</span> : null}
      {phone ? <span className="text-gray-500">{phone}</span> : display}
    </span>
  );
}

export function BookingStatusBadge({ sectionType, booking, master, now }) {
  if (sectionType === 'future') return null;
  const meta = getStatusBadgeForPast(booking, master, now);
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${meta.cls}`}>
      {meta.label}
    </span>
  );
}
