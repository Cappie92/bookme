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

  const apiUrl = (
    process.env.API_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    ''
  ).trim();
  const webUrl = (
    process.env.WEB_URL ||
    process.env.EXPO_PUBLIC_WEB_URL ||
    ''
  ).trim();
  const yandexMobileAuthVisible = (
    process.env.YANDEX_MOBILE_AUTH_VISIBLE ||
    process.env.EXPO_PUBLIC_YANDEX_MOBILE_AUTH_VISIBLE ||
    ''
  ).trim();
  const appMetricaApiKey = (
    process.env.EXPO_PUBLIC_APPMETRICA_API_KEY ||
    process.env.APPMETRICA_API_KEY ||
    ''
  ).trim();

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
        NSPhotoLibraryUsageDescription:
          'Разрешите доступ к фото, чтобы сохранять карточку со свободными слотами в галерею.',
        NSPhotoLibraryAddUsageDescription:
          'Разрешите сохранение карточки со свободными слотами в галерею.',
        LSApplicationQueriesSchemes: [
          'instagram',
          'instagram-stories',
          'tg',
          'telegram',
        ],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#4CAF50',
      },
      package: 'ru.dedato.mobile',
      versionCode: 1,
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: httpsIntentData,
          category: ['BROWSABLE', 'DEFAULT'],
        },
        {
          action: 'VIEW',
          /** pathPrefix на полный путь /m/... (не dedato://m/ где path=/slug без /m). */
          data: [{ scheme: 'dedato', pathPrefix: '/m' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
        {
          action: 'VIEW',
          data: [
            { scheme: 'dedato', host: 'subscriptions' },
            { scheme: 'dedato', pathPrefix: '/subscriptions' },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      '@react-native-community/datetimepicker',
      [
        'expo-media-library',
        {
          photosPermission:
            'Разрешите доступ к фото, чтобы сохранять карточку со свободными слотами в галерею.',
          savePhotosPermission:
            'Разрешите сохранение карточки со свободными слотами в галерею.',
        },
      ],
    ],
    extra: {
      ...config.extra,
      ...(apiUrl ? { API_URL: apiUrl } : {}),
      ...(webUrl ? { WEB_URL: webUrl } : {}),
      ...(yandexMobileAuthVisible ? { YANDEX_MOBILE_AUTH_VISIBLE: yandexMobileAuthVisible } : {}),
      ...(appMetricaApiKey ? { EXPO_PUBLIC_APPMETRICA_API_KEY: appMetricaApiKey } : {}),
    },
  };
};
