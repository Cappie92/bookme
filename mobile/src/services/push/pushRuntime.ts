import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const ANDROID_BOOKINGS_CHANNEL_ID = 'bookings';

let configured = false;

export function pushNotificationHandlerBehavior(): {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
} {
  // Android FCM may deliver to a still-alive JS runtime while the app is
  // backgrounded. A false handler then swallows the system tray notification.
  // iOS APNs presents independently; keep the existing foreground-silent contract.
  const presentOnAndroid = Platform.OS === 'android';
  return {
    shouldShowBanner: presentOnAndroid,
    shouldShowList: presentOnAndroid,
    shouldPlaySound: presentOnAndroid,
    shouldSetBadge: false,
  };
}

export async function ensureAndroidBookingsChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_BOOKINGS_CHANNEL_ID, {
      name: 'Записи',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      enableVibrate: true,
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch {
    /* fail-open */
  }
}

/**
 * Foreground handler + Android bookings channel. Safe to call repeatedly.
 */
export async function configurePushNotificationRuntime(): Promise<void> {
  if (!configured) {
    configured = true;
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => pushNotificationHandlerBehavior(),
      });
    } catch {
      /* native module missing in tests / Expo Go */
    }
  }
  await ensureAndroidBookingsChannel();
}

export function __resetPushRuntimeConfiguredForTests(): void {
  configured = false;
}
