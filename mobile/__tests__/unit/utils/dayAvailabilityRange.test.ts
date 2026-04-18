import {
  resolveDayRangeMinutes,
  thirtyMinuteSlotsInRange,
} from '@src/utils/dayAvailabilityRange';

describe('dayAvailabilityRange', () => {
  it('rejects start >= end', () => {
    const r = resolveDayRangeMinutes(10, 0, 9, 0);
    expect(r.ok).toBe(false);
  });

  it('rejects minutes other than 00 or 30', () => {
    const r = resolveDayRangeMinutes(9, 10, 10, 0);
    expect(r.ok).toBe(false);
  });

  it('accepts 24:00 as end of day', () => {
    const r = resolveDayRangeMinutes(23, 30, 24, 0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.endMin).toBe(24 * 60);
    }
  });

  it('09:00–10:30 yields exactly 9:00, 9:30, 10:00 (strict range, no overlap expansion)', () => {
    const r = resolveDayRangeMinutes(9, 0, 10, 30);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const slots = thirtyMinuteSlotsInRange(r.startMin, r.endMin);
    const keys = new Set(slots.map((x) => `${x.hour}:${x.minute}`));
    expect(keys).toEqual(new Set(['9:0', '9:30', '10:0']));
  });

  it('09:30–10:00 yields only 9:30', () => {
    const r = resolveDayRangeMinutes(9, 30, 10, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const slots = thirtyMinuteSlotsInRange(r.startMin, r.endMin);
    expect(slots.map((s) => `${s.hour}:${s.minute}`)).toEqual(['9:30']);
  });
});
