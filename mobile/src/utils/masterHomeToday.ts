import type { Booking } from '@src/services/api/bookings';
import { isSameLocalDay } from '@src/utils/dateLocal';

const CANCELLED_STATUSES = new Set([
  'cancelled',
  'cancelled_by_client_early',
  'cancelled_by_client_late',
  'payment_expired',
]);

export const TODAY_BOOKINGS_LIMIT = 5;

export function isCancelledBookingStatus(status: string | undefined | null): boolean {
  return CANCELLED_STATUSES.has(String(status || '').toLowerCase());
}

/** Записи на сегодня (локальная дата), без отменённых, по start_time ASC. */
export function filterTodayBookings(
  bookings: Booking[],
  targetDate: Date = new Date()
): Booking[] {
  return bookings
    .filter((b) => {
      const start = b.start_time || `${(b as { date?: string }).date || ''}T${(b as { time?: string }).time || '00:00'}:00`;
      return isSameLocalDay(start, targetDate) && !isCancelledBookingStatus(b.status);
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

export function getBookingClientLabel(booking: Booking): string {
  const alias = (booking.client_master_alias ?? '').trim();
  if (alias) return alias;
  const account = (booking.client_account_name ?? booking.client_name ?? '').trim();
  if (account) return account;
  const phone = (booking.client_phone ?? '').trim();
  if (phone) return phone;
  return 'Клиент';
}
