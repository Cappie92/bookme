import fs from 'fs';
import path from 'path';
import { NOTIFICATIONS_USE_DEV_MOCK } from '@src/components/master/notifications/notificationsMock';

describe('legacy mock is not a production source', () => {
  it('keeps NOTIFICATIONS_USE_DEV_MOCK off', () => {
    expect(NOTIFICATIONS_USE_DEV_MOCK).toBe(false);
  });

  it('hook never imports the mock list or local viewed storage', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../src/hooks/useMasterNotifications.ts'),
      'utf8'
    );
    expect(src).not.toContain('DEV_MOCK_SCHEDULE_NOTIFICATIONS');
    expect(src).not.toContain('NOTIFICATIONS_USE_DEV_MOCK');
    expect(src).not.toContain('masterNotificationsViewedStorage');
    expect(src).not.toContain('loadViewedNotificationIds');
    expect(src).not.toContain('__DEV__');
    expect(src).not.toContain('getNotificationUnreadCount');
    expect(src).not.toContain('markNotificationRead');
    expect(src).not.toContain('markAllNotificationsRead');
    expect(src).not.toContain('unreadOnly');
  });
});
