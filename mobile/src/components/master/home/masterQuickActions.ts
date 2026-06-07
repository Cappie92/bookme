import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { MasterFeatures } from '@src/services/api/master';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Пункт быстрого действия на главной мастера. Sync feature keys with MasterHamburgerMenu menuItems. */
export interface MasterQuickActionItem {
  id: string;
  label: string;
  icon: IoniconName;
  route: string;
  feature: keyof MasterFeatures | null;
}

/** Быстрые действия главного экрана — подмножество MasterHamburgerMenu. */
export const MASTER_QUICK_ACTIONS: MasterQuickActionItem[] = [
  { id: 'schedule', label: 'Расписание', icon: 'calendar-outline', route: '/master/schedule', feature: null },
  { id: 'clients', label: 'Клиенты', icon: 'people-outline', route: '/master/clients', feature: null },
  { id: 'finance', label: 'Финансы', icon: 'wallet-outline', route: '/master/finance', feature: 'has_finance_access' },
  { id: 'stats', label: 'Статистика', icon: 'bar-chart-outline', route: '/master/stats', feature: 'has_extended_stats' },
  { id: 'loyalty', label: 'Лояльность', icon: 'gift-outline', route: '/master/loyalty', feature: 'has_loyalty_access' },
  {
    id: 'client_restrictions',
    label: 'Правила',
    icon: 'ban-outline',
    route: '/master/client-restrictions',
    feature: 'has_client_restrictions',
  },
  { id: 'website', label: 'Сайт', icon: 'globe-outline', route: '/master/settings', feature: null },
];

export function isMasterQuickActionDisabled(
  item: MasterQuickActionItem,
  features: MasterFeatures | null,
  loading: boolean
): boolean {
  if (!item.feature) return false;
  if (loading || !features) return true;
  return features[item.feature] !== true;
}
