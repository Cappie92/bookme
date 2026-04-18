import { calcChange } from '@src/utils/statsChange';

describe('calcChange', () => {
  it('today=3, yesterday=0 → percent=null, label="рост от нулевой базы"', () => {
    const r = calcChange(3, 0);
    expect(r.percent).toBeNull();
    expect(r.absoluteDelta).toBe(3);
    expect(r.label).toBe('рост от нулевой базы');
  });

  it('today=0, yesterday=3 → percent=-100', () => {
    const r = calcChange(0, 3);
    expect(r.percent).toBe(-100);
    expect(r.absoluteDelta).toBe(-3);
    expect(r.label).toBeNull();
  });

  it('today=3, yesterday=3 → percent=0', () => {
    const r = calcChange(3, 3);
    expect(r.percent).toBe(0);
    expect(r.absoluteDelta).toBe(0);
    expect(r.label).toBeNull();
  });

  it('today=0, yesterday=0 → percent=0', () => {
    const r = calcChange(0, 0);
    expect(r.percent).toBe(0);
    expect(r.absoluteDelta).toBe(0);
    expect(r.label).toBeNull();
  });

  it('today=6, yesterday=3 → percent=100', () => {
    const r = calcChange(6, 3);
    expect(r.percent).toBe(100);
    expect(r.absoluteDelta).toBe(3);
  });
});
