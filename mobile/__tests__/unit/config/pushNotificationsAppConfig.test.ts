import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('push expo app config', () => {
  it('keeps identity/version and adds expo-notifications without ATT/IAP drift', () => {
    const source = readFileSync(path.resolve(__dirname, '../../../app.config.ts'), 'utf8');
    expect(source).toContain("version: '1.0.1'");
    expect(source).toContain("buildNumber: '8'");
    expect(source).toContain("bundleIdentifier: 'com.dedato.app'");
    expect(source).toContain('versionCode: 2');
    expect(source).toContain("package: 'ru.dedato.mobile'");
    expect(source).toContain("'expo-notifications'");
    expect(source).toContain("defaultChannel: 'bookings'");
    expect(source).toContain('enableBackgroundRemoteNotifications: false');
    expect(source).not.toContain('expo-tracking-transparency');
    expect(source).not.toContain('NSUserTrackingUsageDescription');
    expect(source).not.toContain('aps-environment');
  });
});
