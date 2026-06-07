import { isSameLocalDay, toLocalYmd } from '@src/utils/dateLocal';

describe('dateLocal', () => {
  it('toLocalYmd uses local calendar date', () => {
    const d = new Date(2026, 5, 2, 15, 30, 0);
    expect(toLocalYmd(d)).toBe('2026-06-02');
    expect(toLocalYmd('2026-06-02T08:30:00')).toBe('2026-06-02');
  });

  it('isSameLocalDay matches ISO datetime on same local day', () => {
    const target = new Date(2026, 5, 2, 0, 0, 0);
    expect(isSameLocalDay('2026-06-02T23:45:00', target)).toBe(true);
    expect(isSameLocalDay('2026-06-01T23:00:00', target)).toBe(false);
  });
});
