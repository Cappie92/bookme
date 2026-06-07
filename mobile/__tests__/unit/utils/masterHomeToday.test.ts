import type { Booking } from '@src/services/api/bookings';
import { BookingStatus } from '@src/services/api/bookings';
import { filterTodayBookings } from '@src/utils/masterHomeToday';

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

describe('masterHomeToday', () => {
  const today = new Date(2026, 5, 2, 12, 0, 0);

  it('filterTodayBookings keeps only local today and excludes cancelled', () => {
    const items = filterTodayBookings(
      [
        booking({ id: 1, start_time: '2026-06-02T10:00:00' }),
        booking({ id: 2, start_time: '2026-06-03T10:00:00' }),
        booking({
          id: 3,
          start_time: '2026-06-02T18:00:00',
          status: BookingStatus.CANCELLED,
        }),
      ],
      today
    );
    expect(items.map((b) => b.id)).toEqual([1]);
  });

  it('sorts today bookings by start_time asc', () => {
    const items = filterTodayBookings(
      [
        booking({ id: 2, start_time: '2026-06-02T14:00:00' }),
        booking({ id: 1, start_time: '2026-06-02T09:00:00' }),
      ],
      today
    );
    expect(items.map((b) => b.id)).toEqual([1, 2]);
  });
});
