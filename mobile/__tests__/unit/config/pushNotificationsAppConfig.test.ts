import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('push expo app config', () => {
  const root = path.resolve(__dirname, '../../..');
  const source = (relative: string) => readFileSync(path.join(root, relative), 'utf8');

  it('keeps identity/version and adds expo-notifications without ATT/IAP drift', () => {
    const appConfig = source('app.config.ts');
    expect(appConfig).toContain("version: '1.1.0'");
    expect(appConfig).toContain("buildNumber: '13'");
    expect(appConfig).toContain("bundleIdentifier: 'com.dedato.app'");
    expect(appConfig).toContain('versionCode: 6');
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
    expect(pbxproj.match(/CURRENT_PROJECT_VERSION = [^;]+;/g)).toEqual(Array(2).fill('CURRENT_PROJECT_VERSION = 13;'));
    expect(pbxproj.match(/MARKETING_VERSION = [^;]+;/g)).toEqual(Array(2).fill('MARKETING_VERSION = 1.1.0;'));
    const plist = source('ios/DeDato/Info.plist');
    expect(plist).toMatch(/<key>CFBundleShortVersionString<\/key>\s*<string>1\.1\.0<\/string>/);
    expect(plist).toMatch(/<key>CFBundleVersion<\/key>\s*<string>13<\/string>/);
    const entitlementsAssignments = pbxproj.match(/CODE_SIGN_ENTITLEMENTS = [^;]+;/g) || [];
    expect(entitlementsAssignments).toHaveLength(2);
    expect(entitlementsAssignments.every((line) => line.includes('DeDato/DeDato.entitlements'))).toBe(
      true
    );
  });

  it('uses one client-only Firebase config at the native app module path', () => {
    const relative = 'android/app/google-services.json';
    expect(source('app.config.ts')).toContain(`googleServicesFile: './${relative}'`);
    expect(existsSync(path.join(root, relative))).toBe(true);
    expect(existsSync(path.join(root, 'google-services.json'))).toBe(false);

    // Assert only public identity and booleans; never snapshot client config/keys.
    const raw = source(relative);
    const config = JSON.parse(raw);
    expect(config.project_info.project_id).toBe('dedato-3a09b');
    expect(config.client.length).toBe(1);
    expect(config.client[0].client_info.android_client_info.package_name).toBe('ru.dedato.mobile');
    expect(/"(?:private_key|private_key_id)"\s*:|"type"\s*:\s*"service_account"/.test(raw)).toBe(false);
  });

  it('wires Google Services into committed native Gradle without identity/signing changes', () => {
    const projectGradle = source('android/build.gradle');
    const appGradle = source('android/app/build.gradle');
    expect(projectGradle).toContain("classpath('com.google.gms:google-services:4.4.1')");
    expect(appGradle).toContain('apply plugin: "com.google.gms.google-services"');
    expect(appGradle).toContain("applicationId 'ru.dedato.mobile'");
    expect(appGradle).toContain('versionCode 6');
    expect(appGradle).toContain('versionName "1.1.0"');
    expect(appGradle).not.toContain('firebase-bom');
    expect(appGradle).not.toContain('firebase-messaging');
  });

  it('keeps one notification permission and the bookings native fallback channel', () => {
    const manifest = source('android/app/src/main/AndroidManifest.xml');
    expect(manifest.match(/<uses-permission\b[^>]*android:name="android.permission.POST_NOTIFICATIONS"/g)).toHaveLength(1);
    expect(manifest.match(/android:name="com.google.firebase.messaging.default_notification_channel_id"/g)).toHaveLength(1);
    expect(manifest).toMatch(/<meta-data\s+android:name="com.google.firebase.messaging.default_notification_channel_id"\s+android:value="bookings"\s*\/>/);
    expect(source('src/services/push/pushRuntime.ts')).toContain("ANDROID_BOOKINGS_CHANNEL_ID = 'bookings'");
    expect(source('src/services/push/pushRuntime.ts')).toContain('shouldShowBanner: presentOnAndroid');
    expect(manifest).toContain('android:name="com.google.android.gms.permission.AD_ID" tools:node="remove"');
    expect(manifest).not.toMatch(/<uses-permission\b[^>]*android:name="android.permission.(?:ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|CAMERA|RECORD_AUDIO)"/);
  });
});
