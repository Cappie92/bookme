import type { Booking } from '@src/services/api/bookings';
import { BookingStatus } from '@src/services/api/bookings';
import {
  buildBookingAttentionItems,
  buildHomeAttentionItems,
  buildSetupAttentionItems,
} from '@src/utils/masterHomeAttention';

function booking(partial: Partial<Booking> & Pick<Booking, 'id' | 'start_time' | 'status'>): Booking {
  return {
    client_id: 1,
    service_id: 1,
    master_id: 1,
    indie_master_id: null,
    salon_id: null,
    branch_id: null,
    end_time: partial.start_time,
    notes: null,
    payment_method: null,
    payment_amount: null,
    is_paid: null,
    created_at: null,
    updated_at: null,
    client_name: 'Анна',
    service_name: 'Стрижка',
    ...partial,
  };
}

describe('masterHomeAttention', () => {
  const now = new Date(2026, 5, 2, 12, 0, 0);

  it('buildBookingAttentionItems maps pending statuses', () => {
    const items = buildBookingAttentionItems({
      futureBookings: [
        booking({
          id: 1,
          start_time: '2026-06-03T10:00:00',
          status: BookingStatus.AWAITING_CONFIRMATION,
        }),
        booking({
          id: 2,
          start_time: '2026-06-03T11:00:00',
          status: BookingStatus.AWAITING_PAYMENT,
        }),
      ],
      pastBookings: [],
      master: { auto_confirm_bookings: true },
      now,
    });

    expect(items.some((i) => i.id === 'pending_1')).toBe(true);
    expect(items.some((i) => i.id === 'payment_2')).toBe(true);
  });

  it('buildSetupAttentionItems returns empty for no setup gaps', () => {
    expect(buildSetupAttentionItems([])).toEqual([]);
  });

  it('buildHomeAttentionItems returns empty when nothing pending', () => {
    const items = buildHomeAttentionItems({
      futureBookings: [
        booking({
          id: 1,
          start_time: '2026-06-03T10:00:00',
          status: BookingStatus.CONFIRMED,
        }),
      ],
      pastBookings: [],
      master: { auto_confirm_bookings: true },
      setupSources: [],
      now,
    });
    expect(items).toEqual([]);
  });
});
