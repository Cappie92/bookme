export type IosMasterBottomTab = 'dashboard' | 'schedule' | 'services' | 'settings';

export type IosMasterBottomNavItem = Readonly<{
  id: IosMasterBottomTab;
  label: string;
  icon: 'bar-chart-outline' | 'calendar-outline' | 'cut-outline' | 'settings-outline';
  route: '/' | '/master/schedule' | '/master/services' | '/master/settings';
}>;

/**
 * Fixed iOS master surface. It intentionally has no entitlement input: Free,
 * paid and AlwaysFree accounts receive the same four operational destinations.
 */
export const IOS_MASTER_BOTTOM_NAV_ITEMS: readonly IosMasterBottomNavItem[] = [
  { id: 'dashboard', label: 'Дашборд', icon: 'bar-chart-outline', route: '/' },
  { id: 'schedule', label: 'Расписание', icon: 'calendar-outline', route: '/master/schedule' },
  { id: 'services', label: 'Услуги', icon: 'cut-outline', route: '/master/services' },
  { id: 'settings', label: 'Настройки', icon: 'settings-outline', route: '/master/settings' },
] as const;

export function getIosMasterBottomTabFromSegments(
  segments: readonly string[],
): IosMasterBottomTab {
  const masterIndex = segments.indexOf('master');
  const masterDestination = masterIndex >= 0 ? segments[masterIndex + 1] : undefined;

  if (masterDestination === 'schedule') return 'schedule';
  if (masterDestination === 'services') return 'services';
  if (masterDestination === 'settings') return 'settings';
  return 'dashboard';
}
