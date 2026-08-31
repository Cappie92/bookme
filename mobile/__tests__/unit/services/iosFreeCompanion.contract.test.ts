import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FREE_ACTIVE_BOOKINGS_LIMIT, IOS_IAP_ENABLED, isIosFreeCompanion } from '@src/config/iosProductModel';

describe('iOS free-companion release contract', () => {
  const root = path.resolve(__dirname, '../../..');
  const source = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

  it('is source-controlled, disabled for iOS only, and uses Free=20', () => {
    expect(IOS_IAP_ENABLED).toBe(false);
    expect(isIosFreeCompanion('ios')).toBe(true);
    expect(isIosFreeCompanion('android')).toBe(false);
    expect(FREE_ACTIVE_BOOKINGS_LIMIT).toBe(20);
  });

  it('does not mount Apple lifecycle and routes iOS subscriptions to Мой доступ', () => {
    expect(source('app/_layout.tsx')).toContain('IOS_IAP_ENABLED === true ? <AppleIapLifecycle /> : null');
    const subscriptions = source('app/(master)/subscriptions/index.tsx');
    expect(subscriptions).toContain('isIosFreeCompanion(Platform.OS)');
    expect(subscriptions).toContain('<IosAccessScreen />');
    const access = source('src/components/subscriptions/IosAccessScreen.tsx');
    expect(access).toContain('Мой доступ');
    expect(access).toContain('Free включает до 20 активных будущих записей');
    expect(access).toContain('fetchSubscriptionAccessSummary');
    expect(access).not.toContain('fetchCurrentSubscription');
    expect(access).not.toContain('getSubscriptionPaymentHistory');
    expect(access).not.toContain('getBalance');
    expect(access).not.toContain('getSubscriptionPoints');
    expect(access).not.toMatch(/Robokassa|Restore Purchases|Manage Subscription|Подробнее о тарифах/);
  });

  it('keeps the Android commerce implementation present', () => {
    const subscriptions = source('app/(master)/subscriptions/index.tsx');
    expect(subscriptions).toContain('<CommerceSubscriptionsScreen />');
    expect(subscriptions).toContain('<SubscriptionPurchaseModal');
    expect(subscriptions).toContain('<SubscriptionPaymentHistorySection');
    expect(source('app/welcome.tsx')).toContain('!iosFreeCompanion ? <WelcomePricingModal');
    expect(source('src/services/api/subscriptions.ts')).toContain("'/api/subscriptions/my'");
  });

  it('uses the access-only endpoint on iOS while keeping Android /my commerce data', () => {
    const api = source('src/services/api/subscriptions.ts');
    expect(api).toContain("'/api/subscriptions/access-summary'");
    const dashboard = source('app/(master)/index.tsx');
    expect(dashboard).toContain('if (iosFreeCompanion)');
    expect(dashboard).toContain('fetchSubscriptionAccessSummary()');
    expect(dashboard).toContain('fetchCurrentSubscription().catch(() => null)');
  });

  it('keeps StoreKit implementation dormant and fail-closed', () => {
    const service = source('src/services/purchases/AppleIapService.ts');
    expect(service).toContain("'apple_iap_disabled'");
    expect(service).toContain('private readonly iapEnabled: boolean = IOS_IAP_ENABLED');
    expect(source('ios/DeDato.xcodeproj/project.pbxproj')).not.toContain('com.apple.InAppPurchase');
  });
});
