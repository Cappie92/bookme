import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('push expo app config', () => {
  const root = path.resolve(__dirname, '../../..');
  const source = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

  it('keeps identity/version and adds expo-notifications without ATT/IAP drift', () => {
    const appConfig = source('app.config.ts');
    expect(appConfig).toContain("version: '1.0.1'");
    expect(appConfig).toContain("buildNumber: '8'");
    expect(appConfig).toContain("bundleIdentifier: 'com.dedato.app'");
    expect(appConfig).toContain('versionCode: 2');
    expect(appConfig).toContain("package: 'ru.dedato.mobile'");
    expect(appConfig).toContain("'expo-notifications'");
    expect(appConfig).toContain("defaultChannel: 'bookings'");
    expect(appConfig).toContain('enableBackgroundRemoteNotifications: false');
    expect(appConfig).not.toContain('expo-tracking-transparency');
    expect(appConfig).not.toContain('NSUserTrackingUsageDescription');
    expect(appConfig).not.toContain('aps-environment');
  });

  it('keeps committed iOS entitlements for production APNs and associated domains', () => {
    const entitlements = source('ios/DeDato/DeDato.entitlements');
    expect(entitlements).toMatch(
      /<key>aps-environment<\/key>\s*<string>production<\/string>/
    );
    expect(entitlements).toContain('applinks:dedato.ru');
    expect(entitlements).toContain('applinks:www.dedato.ru');
    expect(entitlements).not.toContain('UIBackgroundModes');
    expect(entitlements).not.toContain('remote-notification');

    const pbxproj = source('ios/DeDato.xcodeproj/project.pbxproj');
    const entitlementsAssignments = pbxproj.match(/CODE_SIGN_ENTITLEMENTS = [^;]+;/g) || [];
    expect(entitlementsAssignments).toHaveLength(2);
    expect(entitlementsAssignments.every((line) => line.includes('DeDato/DeDato.entitlements'))).toBe(
      true
    );
  });
});
