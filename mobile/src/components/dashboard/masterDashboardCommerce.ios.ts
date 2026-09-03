export interface MasterDashboardCommerceData {
  balance: null;
  bookingsLimit: null;
  subscription: null;
}

/** Fixed-feature iOS performs no subscription, balance or plan lookup. */
export async function loadMasterDashboardCommerce(): Promise<MasterDashboardCommerceData> {
  return { balance: null, bookingsLimit: null, subscription: null };
}

export async function refreshMasterDashboardEntitlements(_userId?: number): Promise<void> {}
