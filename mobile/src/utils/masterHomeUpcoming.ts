import type { Booking } from '@src/services/api/bookings';
import { isSameLocalDay } from '@src/utils/dateLocal';
import { isCancelledBookingStatus } from '@src/utils/masterHomeToday';

export const UPCOMING_PREVIEW_LIMIT = 3;

export function getBookingStartIso(booking: Booking): string {
  return (
    booking.start_time ||
    `${(booking as { date?: string }).date || ''}T${(booking as { time?: string }).time || '00:00'}:00`
  );
}

/** Ближайшие будущие записи не на сегодня (локальная дата), без отменённых. */
export function filterUpcomingNotToday(
  bookings: Booking[],
  now: Date = new Date(),
  limit = UPCOMING_PREVIEW_LIMIT
): Booking[] {
  return bookings
    .filter((b) => {
      const start = getBookingStartIso(b);
      if (isCancelledBookingStatus(b.status)) return false;
      if (isSameLocalDay(start, now)) return false;
      return new Date(start).getTime() > now.getTime();
    })
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, limit);
}
