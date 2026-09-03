import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IOS_MASTER_CAPABILITIES, IOS_REMOVED_MASTER_ROUTES } from '@src/config/iosMasterCapabilities';

describe('fixed-feature iOS master contract', () => {
  const root = path.resolve(__dirname, '../../..');
  const source = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

  it.each(['free', 'paid', 'always_free'] as const)(
    'has the same immutable capability set for %s entitlement',
    () => {
      expect(IOS_MASTER_CAPABILITIES).toMatchObject({
      dashboard: true,
      bookings: true,
      bookingReschedule: true,
      schedule: true,
      services: true,
      settings: true,
      clientsCrm: false,
      finance: false,
      masterLoyalty: false,
      clientRestrictions: false,
      standaloneStatistics: false,
      salonInvitations: false,
      subscriptions: false,
      });
    }
  );

  it('redirects every removed master route before its generic module mounts', () => {
    for (const route of IOS_REMOVED_MASTER_ROUTES) {
      const relative = route === '/subscriptions'
        ? 'app/(master)/subscriptions/index.ios.tsx'
        : `app/(master)/master/${route.split('/').pop()}.ios.tsx`;
      const routeSource = source(relative);
      expect(routeSource).toContain('<Redirect href="/" />');
    }
  });

  it('keeps StoreKit source dormant but outside active iOS imports and autolinking', () => {
    expect(source('src/services/purchases/AppleIapService.ts')).toContain('class AppleIapService');
    expect(source('src/components/subscriptions/AppleIapLifecycleHost.ios.tsx')).not.toContain("from './AppleIapLifecycle'");
    expect(source('src/components/AccountDeletionSubscriptionWarningHost.ios.tsx')).not.toContain("from '@src/components/AppleSubscription");
    expect(source('package.json')).toContain('"dedato-storekit"');
    expect(source('package.json')).toContain('"autolinking"');
    expect(source('ios/DeDato.xcodeproj/project.pbxproj')).not.toContain('com.apple.InAppPurchase');
  });

  it('keeps Android commerce and feature locks in generic modules', () => {
    expect(source('src/screens/master/SubscriptionsScreen.android.tsx')).toContain('<CommerceSubscriptionsScreen />');
    expect(source('src/components/PlatformFeatureLock.tsx')).toContain('<FeatureLock');
    expect(source('src/components/dashboard/MasterDashboardCommerceCard.tsx')).toContain('Управление подпиской');
    expect(source('src/screens/WelcomeScreen.android.tsx')).toContain('WelcomePricingModal');
  });

  it('uses operational iOS handoff buttons without native domain mutation', () => {
    expect(source('app/(master)/master/schedule.tsx')).toContain('destination="schedule"');
    expect(source('app/(master)/master/services.tsx')).toContain('destination="services"');
    expect(source('app/(master)/master/settings.tsx')).toContain('destination="settings"');
    const website = source('src/components/modals/EditWebsiteModal.tsx');
    expect(website).toContain("Platform.OS !== 'ios' ? <View");
    expect(website).toContain("if (Platform.OS !== 'ios') formData.append('domain', slug)");
  });

  it('keeps the client route tree outside removed master routes', () => {
    expect(source('app/(client)/_layout.tsx')).toContain('<Stack');
    expect(IOS_REMOVED_MASTER_ROUTES.every((route) => !route.startsWith('/client'))).toBe(true);
  });
});
