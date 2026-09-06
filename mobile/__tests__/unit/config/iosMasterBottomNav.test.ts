import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  getIosMasterBottomTabFromSegments,
  IOS_MASTER_BOTTOM_NAV_ITEMS,
} from '@src/config/iosMasterBottomNav';

describe('fixed iOS master bottom navigation', () => {
  const expected = [
    { id: 'dashboard', label: 'Дашборд', route: '/' },
    { id: 'schedule', label: 'Расписание', route: '/master/schedule' },
    { id: 'services', label: 'Услуги', route: '/master/services' },
    { id: 'settings', label: 'Настройки', route: '/master/settings' },
  ];

  it('contains exactly the four approved operational destinations', () => {
    expect(IOS_MASTER_BOTTOM_NAV_ITEMS).toHaveLength(4);
    expect(IOS_MASTER_BOTTOM_NAV_ITEMS.map(({ id, label, route }) => ({ id, label, route })))
      .toEqual(expected);
  });

  it('does not expose Menu or removed paid modules', () => {
    const ids = IOS_MASTER_BOTTOM_NAV_ITEMS.map((item) => item.id);
    expect(ids).not.toContain('menu');
    expect(ids).not.toEqual(expect.arrayContaining([
      'clients',
      'finance',
      'loyalty',
      'restrictions',
      'stats',
      'invitations',
      'subscriptions',
    ]));
  });

  it.each(['Free', 'Paid', 'AlwaysFree'])('is identical for %s access', () => {
    expect(IOS_MASTER_BOTTOM_NAV_ITEMS.map((item) => item.id)).toEqual(
      expected.map((item) => item.id),
    );
  });

  it.each([
    [[], 'dashboard'],
    [['(master)', 'index'], 'dashboard'],
    [['master', 'schedule'], 'schedule'],
    [['(master)', 'master', 'schedule', 'edit'], 'schedule'],
    [['master', 'services'], 'services'],
    [['(master)', 'master', 'services', 'edit'], 'services'],
    [['master', 'settings'], 'settings'],
    [['(master)', 'master', 'settings', 'profile'], 'settings'],
  ] as const)('maps route segments %j to %s', (segments, expectedTab) => {
    expect(getIosMasterBottomTabFromSegments(segments)).toBe(expectedTab);
  });

  it('keeps the existing Android master navigation contract separate', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/components/BottomNavigationCarousel.tsx'),
      'utf8',
    );
    expect(source).toContain("{ id: 'menu', label: 'Меню'");
    expect(source).not.toContain('IOS_MASTER_BOTTOM_NAV_ITEMS');
  });

  it('removes the iOS Menu sheet while retaining the Android implementation', () => {
    const iosMenu = readFileSync(
      path.join(process.cwd(), 'src/components/MasterHamburgerMenu.ios.tsx'),
      'utf8',
    );
    const androidMenu = readFileSync(
      path.join(process.cwd(), 'src/components/MasterHamburgerMenu.tsx'),
      'utf8',
    );
    expect(iosMenu).toContain('return null');
    expect(iosMenu).not.toContain('IOS_MENU_ITEMS');
    expect(androidMenu).toContain("id: 'schedule'");
    expect(androidMenu).toContain("id: 'services'");
  });
});
