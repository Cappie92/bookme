import type { Booking } from '@src/services/api/bookings';
import { BookingStatus } from '@src/services/api/bookings';
import { filterTodayBookings } from '@src/utils/masterHomeToday';
import { filterUpcomingNotToday } from '@src/utils/masterHomeUpcoming';

function booking(partial: Partial<Booking> & Pick<Booking, 'id' | 'start_time'>): Booking {
  return {
    client_id: 1,
    service_id: 1,
    master_id: 1,
    indie_master_id: null,
    salon_id: null,
    branch_id: null,
    end_time: partial.start_time,
    status: BookingStatus.CONFIRMED,
    notes: null,
    payment_method: null,
    payment_amount: null,
    is_paid: null,
    created_at: null,
    updated_at: null,
    ...partial,
  };
}

describe('masterHomeUpcoming', () => {
  const now = new Date(2026, 5, 2, 14, 0, 0);

  it('filterUpcomingNotToday excludes today bookings shown in TodayBookingsCard', () => {
    const all = [
      booking({ id: 1, start_time: '2026-06-02T16:00:00' }),
      booking({ id: 2, start_time: '2026-06-03T10:00:00' }),
      booking({ id: 3, start_time: '2026-06-04T11:00:00' }),
    ];

    const today = filterTodayBookings(all, now);
    const upcoming = filterUpcomingNotToday(all, now);

    expect(today.map((b) => b.id)).toEqual([1]);
    expect(upcoming.map((b) => b.id)).toEqual([2, 3]);
    expect(upcoming.some((b) => today.some((t) => t.id === b.id))).toBe(false);
  });

  it('limits upcoming preview to 3 items', () => {
    const all = [3, 4, 5, 6, 7].map((day) =>
      booking({ id: day, start_time: `2026-06-0${day}T10:00:00` })
    );
    expect(filterUpcomingNotToday(all, now).length).toBe(3);
  });
});
