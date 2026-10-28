import {
  formatBookingDateTime,
  formatDateDDMM,
  formatDateForPicker,
  formatTimeHHMM,
} from '@src/utils/format';

describe('booking times show the master wall time regardless of the device zone', () => {
  it.each([
    ['2030-07-01T09:30:00', '09:30'],
    ['2030-07-01T09:30:00+03:00', '09:30'],
    ['2030-07-01T09:30:00-04:00', '09:30'],
    ['2030-07-01 23:30:00+05:30', '23:30'],
  ])('%s -> %s', (value, expected) => {
    expect(formatTimeHHMM(value)).toBe(expected);
  });

  it('keeps the master calendar date across the device date boundary', () => {
    expect(formatDateDDMM('2030-07-01T00:30:00+03:00')).toBe('01.07');
    expect(formatDateDDMM('2030-06-30T23:30:00-04:00')).toBe('30.06');
    expect(formatBookingDateTime('2030-06-30T23:30:00-04:00', '2030-07-01T00:30:00-04:00')).toBe(
      '30.06 • 23:30–00:30'
    );
  });

  it('formats a picker date as a local calendar day, not UTC midnight', () => {
    expect(formatDateForPicker('2030-07-01')).toBe('01.07, Пн');
  });
});
