import {
  calendarDateFromValue,
  dateFromCalendarDay,
  formatCalendarDateDisplay,
} from '@src/utils/clientDashboard';

describe('mobile reschedule calendar date contract', () => {
  it('extracts YYYY-MM-DD from backend start_time datetime', () => {
    expect(calendarDateFromValue('2026-09-26T12:00:00')).toBe('2026-09-26');
    expect(calendarDateFromValue('2026-09-26T00:00:00')).toBe('2026-09-26');
  });

  it('does not shift midnight or month boundary via Date parse', () => {
    expect(calendarDateFromValue('2026-10-01T00:00:00')).toBe('2026-10-01');
    expect(calendarDateFromValue('2026-09-30T23:30:00')).toBe('2026-09-30');
  });

  it('builds a local Date that formats back to the same YYYY-MM-DD', () => {
    const date = dateFromCalendarDay('2026-09-26');
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(8);
    expect(date!.getDate()).toBe(26);
    expect(calendarDateFromValue(date)).toBe('2026-09-26');
  });

  it('displays DD.MM.YY without ISO', () => {
    expect(formatCalendarDateDisplay('2026-09-26T12:00:00')).toBe('26.09.26');
    expect(formatCalendarDateDisplay('2026-09-26')).toBe('26.09.26');
  });

  it('API date stays YYYY-MM-DD for naive backend datetimes', () => {
    const dateOnly = calendarDateFromValue('2026-09-26T12:00:00');
    expect(dateOnly).toBe('2026-09-26');
    expect(dateOnly).not.toContain('T');
  });
});
