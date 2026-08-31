/**
 * Product model for the 1.0.1 iOS release line.
 *
 * This is intentionally source-controlled and cannot be changed by remote config,
 * build secrets, the backend, or reviewer-specific behavior.
 */
export const IOS_IAP_ENABLED: boolean = false;
export const FREE_ACTIVE_BOOKINGS_LIMIT = 20 as const;

export function isIosFreeCompanion(platformOS: string): boolean {
  return platformOS === 'ios' && IOS_IAP_ENABLED === false;
}
