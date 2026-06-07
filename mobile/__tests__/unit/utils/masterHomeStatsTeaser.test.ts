import type { DashboardStats } from '@src/services/api/master';
import {
  buildStatsTeaserData,
  getStatsTeaserCtaRoute,
} from '@src/utils/masterHomeStatsTeaser';

const baseStats: DashboardStats = {
  current_week_bookings: 12,
  previous_week_bookings: 8,
  current_week_income: 45000,
  previous_week_income: 30000,
  weeks_data: [],
  top_services_by_bookings: [
    { service_id: 1, service_name: 'Стрижка', booking_count: 5 },
  ],
};

describe('masterHomeStatsTeaser', () => {
  it('buildStatsTeaserData maps bookings, income and top service', () => {
    const teaser = buildStatsTeaserData(baseStats);
    expect(teaser).toEqual({
      weekBookings: 12,
      weekIncome: 45000,
      topServiceName: 'Стрижка',
      topServiceBookings: 5,
    });
  });

  it('buildStatsTeaserData returns null without stats', () => {
    expect(buildStatsTeaserData(null)).toBeNull();
  });

  it('getStatsTeaserCtaRoute respects extended stats feature', () => {
    expect(getStatsTeaserCtaRoute(true)).toBe('/master/stats');
    expect(getStatsTeaserCtaRoute(false)).toBe('/subscriptions');
  });
});
