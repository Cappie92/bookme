import { ExpoConfig, ConfigContext } from 'expo/config';

/**
 * Хосты для iOS Associated Domains и Android App Links (нативная часть собирается на build-time).
 * Приоритет: APP_UNIVERSAL_LINK_HOSTS → hostname из WEB_URL (если не localhost) → prod default.
 * Для staging: задайте APP_UNIVERSAL_LINK_HOSTS=staging.example.com в EAS env или в shell перед prebuild.
 */
function universalLinkHostsForNativeConfig(): string[] {
  const explicit = (process.env.APP_UNIVERSAL_LINK_HOSTS || '').trim();
  if (explicit) {
    return explicit.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  const webUrl = (process.env.WEB_URL || '').trim();
  if (webUrl) {
    try {
      const host = new URL(webUrl).hostname.toLowerCase();
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return [host];
      }
    } catch {
      /* ignore */
    }
  }
  return ['dedato.ru', 'www.dedato.ru'];
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const linkHosts = universalLinkHostsForNativeConfig();
  const associatedDomains = linkHosts.map((h) => `applinks:${h}`);

  const httpsIntentData = linkHosts.map((host) => ({
    scheme: 'https' as const,
    host,
    pathPrefix: '/m/',
  }));

  return {
    ...config,
    name: 'DeDato',
    slug: 'dedato',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    scheme: 'dedato',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.dedato.app',
      buildNumber: '1',
      associatedDomains,
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
        },
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      package: 'ru.dedato.mobile',
      versionCode: 1,
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      usesCleartextTraffic: true,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: httpsIntentData,
          category: ['BROWSABLE', 'DEFAULT'],
        },
        {
          action: 'VIEW',
          data: [{ scheme: 'dedato', pathPrefix: '/m' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: ['expo-router'],
  };
};
