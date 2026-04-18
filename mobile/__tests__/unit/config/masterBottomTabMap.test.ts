import { getMasterBottomTabFromSegments, masterBottomTabToIndex } from '@src/config/masterBottomTabMap';

describe('getMasterBottomTabFromSegments', () => {
  it('maps root / index to dashboard', () => {
    expect(getMasterBottomTabFromSegments([])).toBe('dashboard');
    expect(getMasterBottomTabFromSegments(['index'])).toBe('dashboard');
    expect(getMasterBottomTabFromSegments(['(master)'])).toBe('dashboard');
    expect(getMasterBottomTabFromSegments(['(master)', 'index'])).toBe('dashboard');
  });

  it('maps bookings to dashboard (parity with web tab=dashboard for «записи» hub)', () => {
    expect(getMasterBottomTabFromSegments(['bookings'])).toBe('dashboard');
    expect(getMasterBottomTabFromSegments(['(master)', 'bookings'])).toBe('dashboard');
  });

  it('maps master/* (except settings) to menu', () => {
    expect(getMasterBottomTabFromSegments(['master', 'schedule'])).toBe('menu');
    expect(getMasterBottomTabFromSegments(['(master)', 'master', 'stats'])).toBe('menu');
  });

  it('maps subscriptions to menu', () => {
    expect(getMasterBottomTabFromSegments(['subscriptions'])).toBe('menu');
  });

  it('maps settings', () => {
    expect(getMasterBottomTabFromSegments(['master', 'settings'])).toBe('settings');
    expect(getMasterBottomTabFromSegments(['(master)', 'master', 'settings'])).toBe('settings');
  });
});

describe('masterBottomTabToIndex', () => {
  it('maps to bottom nav indices', () => {
    expect(masterBottomTabToIndex('dashboard')).toBe(0);
    expect(masterBottomTabToIndex('menu')).toBe(1);
    expect(masterBottomTabToIndex('settings')).toBe(2);
  });
});
