import {
  getPastBookingStatusLabel,
  getPastBookingStatusColor,
  getPastStatusLabel,
} from '@src/utils/bookingStatusDisplay';

const manualMaster = { auto_confirm_bookings: false };

function hoursBefore(ref: Date, h: number): string {
  return new Date(ref.getTime() - h * 3600_000).toISOString();
}

function hoursAfter(ref: Date, h: number): string {
  return new Date(ref.getTime() + h * 3600_000).toISOString();
}

describe('bookingStatusDisplay', () => {
  const now = new Date('2026-06-02T12:00:00.000Z');

  describe('getPastBookingStatusLabel', () => {
    it('past confirmed with needsOutcome → «На подтверждении»', () => {
      const label = getPastBookingStatusLabel(
        { status: 'confirmed', start_time: hoursBefore(now, 2) },
        manualMaster,
        now
      );
      expect(label).toBe('На подтверждении');
    });

    it('past awaiting_confirmation with needsOutcome → «На подтверждении»', () => {
      const label = getPastBookingStatusLabel(
        { status: 'awaiting_confirmation', start_time: hoursBefore(now, 2) },
        manualMaster,
        now
      );
      expect(label).toBe('На подтверждении');
    });

    it('past created with needsOutcome → «На подтверждении»', () => {
      const label = getPastBookingStatusLabel(
        { status: 'created', start_time: hoursBefore(now, 2) },
        manualMaster,
        now
      );
      expect(label).toBe('На подтверждении');
    });

    it('past completed → «Завершено»', () => {
      const label = getPastBookingStatusLabel(
        { status: 'completed', start_time: hoursBefore(now, 2) },
        manualMaster,
        now
      );
      expect(label).toBe('Завершено');
    });

    it('past cancelled → «Отменено»', () => {
      const label = getPastBookingStatusLabel(
        { status: 'cancelled', start_time: hoursBefore(now, 2) },
        manualMaster,
        now
      );
      expect(label).toBe('Отменено');
    });

    it('future confirmed → не «На подтверждении»', () => {
      const label = getPastBookingStatusLabel(
        { status: 'confirmed', start_time: hoursAfter(now, 2) },
        manualMaster,
        now
      );
      expect(label).toBe('Подтверждено');
      expect(label).not.toBe('На подтверждении');
    });

    it('confirmed и completed не получают одинаковую подпись в past-сценарии', () => {
      const pendingPast = getPastBookingStatusLabel(
        { status: 'confirmed', start_time: hoursBefore(now, 2) },
        manualMaster,
        now
      );
      const finalized = getPastBookingStatusLabel(
        { status: 'completed', start_time: hoursBefore(now, 2) },
        manualMaster,
        now
      );
      expect(pendingPast).toBe('На подтверждении');
      expect(finalized).toBe('Завершено');
      expect(pendingPast).not.toBe(finalized);
    });
  });

  describe('getPastBookingStatusColor', () => {
    it('needsOutcome → amber color', () => {
      const color = getPastBookingStatusColor(
        { status: 'confirmed', start_time: hoursBefore(now, 2) },
        manualMaster,
        now
      );
      expect(color).toBe('#FF9800');
    });

    it('completed → green', () => {
      const color = getPastBookingStatusColor(
        { status: 'completed', start_time: hoursBefore(now, 2) },
        manualMaster,
        now
      );
      expect(color).toBe('#4CAF50');
    });
  });

  describe('getPastStatusLabel fallback', () => {
    it('completed → «Завершено»', () => {
      expect(getPastStatusLabel('completed')).toBe('Завершено');
    });
  });
});
