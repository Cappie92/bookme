import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  ANDROID_BOOKINGS_CHANNEL_ID,
  configurePushNotificationRuntime,
  ensureAndroidBookingsChannel,
  pushNotificationHandlerBehavior,
  __resetPushRuntimeConfiguredForTests,
} from '@src/services/push/pushRuntime';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

describe('Android notification presentation runtime', () => {
  beforeEach(() => {
    __resetPushRuntimeConfiguredForTests();
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = 'ios';
  });

  it('keeps iOS foreground handler silent and skips the Android channel', async () => {
    (Platform as { OS: string }).OS = 'ios';
    expect(pushNotificationHandlerBehavior()).toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
    await configurePushNotificationRuntime();
    expect(Notifications.setNotificationHandler).toHaveBeenCalled();
    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('presents Android remote notifications and creates the bookings channel first', async () => {
    (Platform as { OS: string }).OS = 'android';
    expect(pushNotificationHandlerBehavior()).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
    await configurePushNotificationRuntime();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      ANDROID_BOOKINGS_CHANNEL_ID,
      expect.objectContaining({
        name: 'Записи',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        enableVibrate: true,
      })
    );
    expect(ANDROID_BOOKINGS_CHANNEL_ID).toBe('bookings');
  });

  it('ensureAndroidBookingsChannel is idempotent and android-only', async () => {
    (Platform as { OS: string }).OS = 'ios';
    await ensureAndroidBookingsChannel();
    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    (Platform as { OS: string }).OS = 'android';
    await ensureAndroidBookingsChannel();
    await ensureAndroidBookingsChannel();
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('bookings', expect.any(Object));
  });
});
