import { getBalance, getBookingsLimit, type Balance, type BookingsLimit } from '@src/services/api/master';
import { fetchCurrentSubscription, type Subscription } from '@src/services/api/subscriptions';
import { refreshMasterFeaturesGlobally } from '@src/utils/masterFeaturesRefresh';

export interface MasterDashboardCommerceData {
  balance: Balance | null;
  bookingsLimit: BookingsLimit | null;
  subscription: Subscription | null;
}

export async function loadMasterDashboardCommerce(): Promise<MasterDashboardCommerceData> {
  const [balance, bookingsLimit, subscription] = await Promise.all([
    getBalance().catch(() => null),
    getBookingsLimit().catch(() => null),
    fetchCurrentSubscription().catch(() => null),
  ]);
  return { balance, bookingsLimit, subscription };
}

export async function refreshMasterDashboardEntitlements(userId?: number): Promise<void> {
  await refreshMasterFeaturesGlobally(userId);
}
