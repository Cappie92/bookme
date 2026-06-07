import {
  MASTER_QUICK_ACTIONS,
  isMasterQuickActionDisabled,
} from '@src/components/master/home/masterQuickActions';
import type { MasterFeatures } from '@src/services/api/master';

const baseFeatures: MasterFeatures = {
  has_booking_page: true,
  has_unlimited_bookings: false,
  has_extended_stats: true,
  has_loyalty_access: false,
  has_finance_access: true,
  has_client_restrictions: false,
  has_clients_access: true,
  can_customize_domain: false,
  max_page_modules: 0,
  stats_retention_days: 30,
  plan_name: 'Premium',
  plan_id: 1,
  current_page_modules: 0,
  can_add_more_modules: false,
};

describe('masterQuickActions', () => {
  it('exposes expected quick action routes', () => {
    const routes = MASTER_QUICK_ACTIONS.map((a) => a.route);
    expect(routes).toContain('/master/schedule');
    expect(routes).toContain('/master/clients');
    expect(routes).toContain('/master/finance');
    expect(routes).toContain('/master/stats');
    expect(routes).toContain('/master/loyalty');
    expect(routes).toContain('/master/client-restrictions');
    expect(routes).toContain('/master/settings');
  });

  it('isMasterQuickActionDisabled mirrors feature flags', () => {
    const finance = MASTER_QUICK_ACTIONS.find((a) => a.id === 'finance')!;
    const schedule = MASTER_QUICK_ACTIONS.find((a) => a.id === 'schedule')!;

    expect(isMasterQuickActionDisabled(schedule, baseFeatures, false)).toBe(false);
    expect(isMasterQuickActionDisabled(finance, baseFeatures, false)).toBe(false);
    expect(isMasterQuickActionDisabled(finance, { ...baseFeatures, has_finance_access: false }, false)).toBe(
      true
    );
    expect(isMasterQuickActionDisabled(finance, baseFeatures, true)).toBe(true);
    expect(isMasterQuickActionDisabled(finance, null, false)).toBe(true);
  });
});
