/**
 * Единый mapping маршрута → нижний таб мастера (согласован с web MasterDashboard + MasterMobileBottomNav).
 *
 * Дашборд: дом группы (master) и экраны «обзор записей» — на web это tab=dashboard.
 * Меню: каталог разделов (master/* кроме settings) + subscriptions — на web tab из MASTER_NAV_CATALOG или sheet.
 * Настройки: master/settings.
 */
export type MasterBottomTab = 'dashboard' | 'menu' | 'settings';

export function getMasterBottomTabFromSegments(segments: readonly string[]): MasterBottomTab {
  const a = segments[0];
  const b = segments[1];
  const c = segments[2];

  if ((a === 'master' && b === 'settings') || (b === 'master' && c === 'settings')) {
    return 'settings';
  }

  // Корень (master)/index — дашборд
  if (!a || a === 'index') return 'dashboard';
  if (a === '(master)' && (!b || b === 'index')) return 'dashboard';

  // Список/деталь записей — тот же UX-контур что главный обзор на web (tab=dashboard)
  if (a === 'bookings' || (a === '(master)' && b === 'bookings')) return 'dashboard';

  // Тариф / подписки — в каталоге (tariff), не «дом»
  if (a === 'subscriptions' || (a === '(master)' && b === 'subscriptions')) return 'menu';

  // Разделы master/schedule, master/services, …
  if (a === 'master' || b === 'master') return 'menu';

  return 'dashboard';
}

export function masterBottomTabToIndex(tab: MasterBottomTab): number {
  switch (tab) {
    case 'dashboard':
      return 0;
    case 'menu':
      return 1;
    case 'settings':
      return 2;
    default:
      return 0;
  }
}
