import type { AccountDeletionSubscriptionCheck } from '@src/services/accountDeletionAppleSubscription';

export async function checkSubscriptionBeforeAccountDeletion(): Promise<AccountDeletionSubscriptionCheck> {
  return 'continue_deletion';
}
