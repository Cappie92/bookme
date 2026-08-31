import {
  checkAppleSubscriptionBeforeAccountDeletion,
  hasActiveAppleSubscription,
} from '@src/services/accountDeletionAppleSubscription';
import { SubscriptionStatus, SubscriptionType, type Subscription } from '@src/services/api/subscriptions';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function subscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 1,
    user_id: 2,
    subscription_type: SubscriptionType.MASTER,
    status: SubscriptionStatus.ACTIVE,
    salon_branches: 0,
    salon_employees: 0,
    master_bookings: 0,
    end_date: '2026-09-30T00:00:00Z',
    price: 1000,
    auto_renewal: true,
    payment_method: 'app_store',
    plan_id: 3,
    plan_name: 'Pro',
    billing_provider: 'apple',
    is_active: true,
    ...overrides,
  };
}

describe('Apple subscription account-deletion guard', () => {
  it('shows the warning for an active Apple subscription', async () => {
    const load = jest.fn(async () => subscription());
    await expect(checkAppleSubscriptionBeforeAccountDeletion(load, true)).resolves.toBe(
      'warn_active_apple'
    );
    expect(hasActiveAppleSubscription(await load())).toBe(true);
  });

  it.each([
    null,
    subscription({ billing_provider: 'robokassa' }),
    subscription({ status: SubscriptionStatus.EXPIRED, is_active: false }),
  ])('does not add an Apple blocker for %p', async (value) => {
    await expect(
      checkAppleSubscriptionBeforeAccountDeletion(async () => value, true)
    ).resolves.toBe('continue_deletion');
  });

  it('fails open when subscription status cannot be determined', async () => {
    await expect(
      checkAppleSubscriptionBeforeAccountDeletion(async () => {
        throw new Error('network unavailable');
      }, true)
    ).resolves.toBe('continue_deletion');
  });

  it('does not load Apple subscription state in the iOS free-companion model', async () => {
    const load = jest.fn(async () => subscription());
    await expect(checkAppleSubscriptionBeforeAccountDeletion(load)).resolves.toBe(
      'continue_deletion'
    );
    expect(load).not.toHaveBeenCalled();
  });

  it('is wired into both mobile deletion settings flows', () => {
    const root = path.resolve(__dirname, '../../..');
    const client = readFileSync(path.join(root, 'app/(client)/settings/index.tsx'), 'utf8');
    const master = readFileSync(path.join(root, 'app/(master)/master/settings.tsx'), 'utf8');
    for (const source of [client, master]) {
      expect(source).toContain('checkAppleSubscriptionBeforeAccountDeletion')
      expect(source).toContain('AppleSubscriptionDeletionWarningModal')
      expect(source).toContain('setShowDeleteModal(true)')
    }
  });
});
