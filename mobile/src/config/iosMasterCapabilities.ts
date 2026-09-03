/**
 * Immutable native iOS product policy.
 *
 * These capabilities are deliberately independent from subscription plans,
 * billing providers and backend entitlement flags. Android/web continue to
 * use the existing entitlement model.
 */
export const IOS_MASTER_CAPABILITIES = Object.freeze({
  dashboard: true,
  bookings: true,
  bookingReschedule: true,
  schedule: true,
  services: true,
  settings: true,
  browserScheduleEditor: true,
  browserServicesEditor: true,
  browserPublicPageEditor: true,
  clientsCrm: false,
  finance: false,
  masterLoyalty: false,
  clientRestrictions: false,
  standaloneStatistics: false,
  salonInvitations: false,
  subscriptions: false,
} as const);

export type IosMasterCapability = keyof typeof IOS_MASTER_CAPABILITIES;

export const IOS_REMOVED_MASTER_ROUTES = Object.freeze([
  '/master/clients',
  '/master/finance',
  '/master/loyalty',
  '/master/client-restrictions',
  '/master/stats',
  '/master/invitations',
  '/subscriptions',
] as const);
