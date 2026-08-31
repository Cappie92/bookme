import {
  fetchCurrentSubscription,
  SubscriptionStatus,
  type Subscription,
} from '@src/services/api/subscriptions';
import { IOS_IAP_ENABLED } from '@src/config/iosProductModel';

export type AccountDeletionSubscriptionCheck = 'warn_active_apple' | 'continue_deletion';

export function hasActiveAppleSubscription(
  subscription: Subscription | null | undefined
): boolean {
  if (!subscription) return false;
  if ((subscription.billing_provider || '').toLowerCase() !== 'apple') return false;
  return subscription.is_active === true || subscription.status === SubscriptionStatus.ACTIVE;
}

/**
 * Subscription lookup must never make account deletion unavailable. Any lookup
 * failure falls through to the existing deletion confirmation.
 */
export async function checkAppleSubscriptionBeforeAccountDeletion(
  loadSubscription: () => Promise<Subscription | null> = fetchCurrentSubscription,
  iapEnabled: boolean = IOS_IAP_ENABLED
): Promise<AccountDeletionSubscriptionCheck> {
  if (!iapEnabled) return 'continue_deletion';
  try {
    const subscription = await loadSubscription();
    return hasActiveAppleSubscription(subscription)
      ? 'warn_active_apple'
      : 'continue_deletion';
  } catch {
    return 'continue_deletion';
  }
}
