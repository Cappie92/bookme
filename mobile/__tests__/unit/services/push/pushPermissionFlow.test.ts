import * as Notifications from 'expo-notifications';
import { requestPushPermission } from '@src/services/push/pushPermissions';
import { evaluatePushPermissionUx } from '@src/services/push/pushEligibility';

describe('push permission education flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not call the system prompt when education is dismissed', async () => {
    const decision = evaluatePushPermissionUx({
      eligible: true,
      permission: 'undetermined',
      education: 'dismissed',
      foreground: true,
    });
    expect(decision.action).toBe('idle');
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission only after education accept', async () => {
    const before = evaluatePushPermissionUx({
      eligible: true,
      permission: 'undetermined',
      education: 'unseen',
      foreground: true,
    });
    expect(before.action).toBe('show_education');
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      granted: false,
    });
    const after = await requestPushPermission();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(after).toBe('denied');
  });
});
