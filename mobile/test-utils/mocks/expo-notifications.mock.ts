const mockExpoNotifications = {
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({
    status: 'undetermined',
    granted: false,
    canAskAgain: true,
    expires: 'never',
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
    expires: 'never',
  })),
  getExpoPushTokenAsync: jest.fn(async () => ({
    type: 'expo',
    data: 'ExponentPushToken[testtoken]',
  })),
  setNotificationChannelAsync: jest.fn(async () => null),
  AndroidImportance: {
    UNKNOWN: 0,
    UNSPECIFIED: 1,
    NONE: 2,
    MIN: 3,
    LOW: 4,
    DEFAULT: 5,
    HIGH: 6,
    MAX: 7,
  },
  IosAuthorizationStatus: {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  },
};

module.exports = {
  __esModule: true,
  ...mockExpoNotifications,
  default: mockExpoNotifications,
};
