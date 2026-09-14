import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

let configured = false;

/**
 * Stage 2 foreground contract (Stage 6 will refresh the in-app notification center):
 * no OS banner/list, no sound, no badge mutation.
 */
export async function configurePushNotificationRuntime(): Promise<void> {
  if (configured) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    /* native module missing in tests / Expo Go */
  }

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('bookings', {
        name: 'Записи',
        importance: Notifications.AndroidImportance.HIGH,
      });
    } catch {
      /* fail-open */
    }
  }
}

export function __resetPushRuntimeConfiguredForTests(): void {
  configured = false;
}
