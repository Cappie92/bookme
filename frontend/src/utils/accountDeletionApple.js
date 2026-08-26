import { fetchCurrentSubscription } from './subscriptionsApi'

export const APPLE_SUBSCRIPTION_MANAGEMENT_URL = 'https://apps.apple.com/account/subscriptions'

export function hasActiveAppleSubscription(subscription) {
  if (!subscription) return false
  if (String(subscription.billing_provider || '').toLowerCase() !== 'apple') return false
  return subscription.is_active === true || subscription.status === 'active'
}

/** Ошибка read-only проверки подписки не должна блокировать удаление аккаунта. */
export async function checkAppleSubscriptionBeforeAccountDeletion(
  loadSubscription = fetchCurrentSubscription
) {
  try {
    const subscription = await loadSubscription()
    return hasActiveAppleSubscription(subscription) ? 'warn_active_apple' : 'continue_deletion'
  } catch {
    return 'continue_deletion'
  }
}
