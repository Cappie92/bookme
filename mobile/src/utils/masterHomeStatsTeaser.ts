import type { DashboardStats } from '@src/services/api/master';
import { stripIndiePrefix } from '@src/utils/stripIndiePrefix';

export interface StatsTeaserData {
  weekBookings: number;
  weekIncome: number;
  topServiceName: string | null;
  topServiceBookings: number | null;
}

export function buildStatsTeaserData(stats: DashboardStats | null): StatsTeaserData | null {
  if (!stats) return null;

  const top = stats.top_services_by_bookings?.[0];

  return {
    weekBookings: stats.current_week_bookings ?? 0,
    weekIncome: stats.current_week_income ?? 0,
    topServiceName: top?.service_name ? stripIndiePrefix(top.service_name) : null,
    topServiceBookings: top?.booking_count ?? null,
  };
}

export function getStatsTeaserCtaRoute(hasExtendedStats: boolean): '/master/stats' | '/subscriptions' {
  return hasExtendedStats ? '/master/stats' : '/subscriptions';
}
