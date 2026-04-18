import {
  getUserBookings,
  getFutureBookings,
  getPastBookings,
  getBookingById,
  fetchBookingById,
  getAvailableSlots,
  updateBooking,
  cancelBooking,
  getStatusLabel,
  getStatusColor,
  BookingStatus,
} from '@src/services/api/bookings';
import { apiClient } from "@src/services/api/client";
import { mockBookings } from '../../../../test-utils/helpers/test-data';

describe('Bookings API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserBookings', () => {
    it('should use correct endpoint for client', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockBookings });

      await getUserBookings({}, 'client');

      expect(apiClient.get).toHaveBeenCalledWith('/api/client/bookings/');
    });

    it('should use correct endpoint for master', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockBookings });

      await getUserBookings({}, 'master');

      expect(apiClient.get).toHaveBeenCalledWith('/api/master/bookings/detailed');
    });

    it('should use correct endpoint for indie', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockBookings });

      await getUserBookings({}, 'indie');

      expect(apiClient.get).toHaveBeenCalledWith('/api/master/bookings/detailed');
    });

    it('should normalize role to lowercase', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockBookings });

      await getUserBookings({}, 'CLIENT');

      expect(apiClient.get).toHaveBeenCalledWith('/api/client/bookings/');
    });

    it('should add query parameters', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockBookings });

      await getUserBookings(
        {
          status: BookingStatus.CREATED,
          start_date: '2025-01-01T00:00:00Z',
        },
        'client'
      );

      const callArgs = (apiClient.get as jest.Mock).mock.calls[0][0];
      expect(callArgs).toContain('/api/client/bookings/');
      expect(callArgs).toContain('status=created');
      expect(callArgs).toContain('start_date');
    });
  });

  describe('getFutureBookings', () => {
    it('should get future bookings for client', async () => {
      const futureBooking = {
        ...mockBookings[0],
        start_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      };
      (apiClient.get as jest.Mock).mockResolvedValue({ data: [futureBooking] });

      const result = await getFutureBookings('client');

      expect(apiClient.get).toHaveBeenCalledWith('/api/client/bookings/');
      expect(result).toHaveLength(1);
    });

    it('should filter future bookings for other roles', async () => {
      const now = new Date();
      const futureBooking = {
        ...mockBookings[0],
        start_time: new Date(now.getTime() + 86400000).toISOString(),
      };
      const pastBooking = {
        ...mockBookings[0],
        start_time: new Date(now.getTime() - 86400000).toISOString(),
      };
      (apiClient.get as jest.Mock).mockResolvedValue({
        data: [futureBooking, pastBooking],
      });

      const result = await getFutureBookings('master');

      expect(result.length).toBeGreaterThan(0);
      expect(new Date(result[0].start_time).getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('getPastBookings', () => {
    it('should get past bookings for client', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockBookings });

      await getPastBookings('client');

      expect(apiClient.get).toHaveBeenCalledWith('/api/client/bookings/past');
    });

    it('should filter past bookings for other roles', async () => {
      const now = new Date();
      const pastBooking = {
        ...mockBookings[0],
        start_time: new Date(now.getTime() - 86400000).toISOString(),
      };
      (apiClient.get as jest.Mock).mockResolvedValue({ data: [pastBooking] });

      const result = await getPastBookings('master');

      expect(result.length).toBeGreaterThan(0);
      expect(new Date(result[0].start_time).getTime()).toBeLessThanOrEqual(now.getTime());
    });
  });

  describe('getBookingById', () => {
    it('should get booking by id', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockBookings[0] });

      const result = await getBookingById(1);

      expect(apiClient.get).toHaveBeenCalledWith('/api/bookings/1');
      expect(result).toEqual(mockBookings[0]);
    });
  });

  describe('fetchBookingById', () => {
    it('should fetch booking by id (string)', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockBookings[0] });

      const result = await fetchBookingById('1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/bookings/1');
      expect(result).toEqual(mockBookings[0]);
    });

    it('should fetch booking by id (number)', async () => {
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockBookings[0] });

      const result = await fetchBookingById(1);

      expect(apiClient.get).toHaveBeenCalledWith('/api/bookings/1');
      expect(result).toEqual(mockBookings[0]);
    });
  });

  describe('getAvailableSlots', () => {
    it('should get available slots', async () => {
      const mockSlots = {
        booking_id: 1,
        service_name: 'Стрижка',
        service_duration: 30,
        current_start_time: '2025-12-25T16:00:00Z',
        available_slots: [
          {
            start_time: '2025-12-26T10:00:00Z',
            end_time: '2025-12-26T10:30:00Z',
            formatted_time: '10:00',
          },
        ],
      };
      (apiClient.get as jest.Mock).mockResolvedValue({ data: mockSlots });

      const result = await getAvailableSlots(1, '2025-12-26');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/client/bookings/1/available-slots?date=2025-12-26'
      );
      expect(result).toEqual(mockSlots);
    });
  });

  describe('updateBooking', () => {
    it('should update booking time', async () => {
      const newStartTime = '2025-12-26T16:00:00Z';
      const updatedBooking = { ...mockBookings[0], start_time: newStartTime };
      (apiClient.put as jest.Mock).mockResolvedValue({ data: updatedBooking });

      const result = await updateBooking(1, { start_time: newStartTime });

      expect(apiClient.put).toHaveBeenCalledWith('/api/client/bookings/1', {
        start_time: newStartTime,
      });
      expect(result.start_time).toBe(newStartTime);
    });

    it('should update booking notes', async () => {
      const updatedBooking = { ...mockBookings[0], notes: 'New notes' };
      (apiClient.put as jest.Mock).mockResolvedValue({ data: updatedBooking });

      const result = await updateBooking(1, { notes: 'New notes' });

      expect(apiClient.put).toHaveBeenCalledWith('/api/client/bookings/1', {
        notes: 'New notes',
      });
      expect(result.notes).toBe('New notes');
    });
  });

  describe('cancelBooking', () => {
    it('should cancel booking', async () => {
      const cancelledBooking = { ...mockBookings[0], status: BookingStatus.CANCELLED };
      (apiClient.delete as jest.Mock).mockResolvedValue({ data: cancelledBooking });

      const result = await cancelBooking(1);

      expect(apiClient.delete).toHaveBeenCalledWith('/api/client/bookings/1');
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });
  });

  describe('getStatusLabel', () => {
    it('should return correct label for each status', () => {
      expect(getStatusLabel(BookingStatus.CREATED)).toBe('Создано');
      expect(getStatusLabel(BookingStatus.CONFIRMED)).toBe('Подтверждено');
      expect(getStatusLabel(BookingStatus.AWAITING_CONFIRMATION)).toBe('На подтверждении');
      expect(getStatusLabel(BookingStatus.COMPLETED)).toBe('Завершено');
      expect(getStatusLabel(BookingStatus.CANCELLED)).toBe('Отменено');
      expect(getStatusLabel(BookingStatus.AWAITING_PAYMENT)).toBe('Ожидает оплаты');
    });

    it('should return status as string for unknown status', () => {
      expect(getStatusLabel('unknown' as BookingStatus)).toBe('unknown');
    });
  });

  describe('getStatusColor', () => {
    it('should return correct color for each status', () => {
      expect(getStatusColor(BookingStatus.CREATED)).toBe('#757575');
      expect(getStatusColor(BookingStatus.CONFIRMED)).toBe('#4CAF50');
      expect(getStatusColor(BookingStatus.AWAITING_CONFIRMATION)).toBe('#757575');
      expect(getStatusColor(BookingStatus.COMPLETED)).toBe('#4CAF50');
      expect(getStatusColor(BookingStatus.CANCELLED)).toBe('#F44336');
      expect(getStatusColor(BookingStatus.AWAITING_PAYMENT)).toBe('#FFC107');
    });

    it('should return default color for unknown status', () => {
      expect(getStatusColor('unknown' as BookingStatus)).toBe('#757575');
    });
  });
});

