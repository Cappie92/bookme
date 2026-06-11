import type { MasterScheduleNotification } from '@src/components/master/notifications/notificationsTypes';
import {
  applyViewedState,
  countUnreadNotifications,
  filterNotifications,
  getNotificationGroupLabel,
  getNotificationStripeColor,
  groupNotificationsByDate,
  shouldShowNotificationsUnreadIndicator,
} from '@src/utils/masterNotificationsUtils';

const NOW = new Date('2026-06-02T12:00:00.000Z');

function n(
  partial: Partial<MasterScheduleNotification> & { id: string; type?: MasterScheduleNotification['type'] }
): MasterScheduleNotification {
  const type = partial.type ?? 'created';
  const base = {
    clientName: 'Клиент',
    serviceName: 'Услуга',
    isUnread: true,
    createdAt: '2026-06-02T10:00:00.000Z',
    ...partial,
    type,
  };
  if (type === 'updated') {
    return {
      ...base,
      oldDateLabel: '1 июня',
      oldTimeLabel: '10:00',
      newDateLabel: '2 июня',
      newTimeLabel: '12:00',
    } as MasterScheduleNotification;
  }
  if (type === 'cancelled') {
    return {
      ...base,
      clientStatus: 'returning',
      dateLabel: '2 июня',
      timeLabel: '10:00',
    } as MasterScheduleNotification;
  }
  return {
    ...base,
    clientStatus: 'new',
    dateLabel: '2 июня',
    timeLabel: '10:00',
  } as MasterScheduleNotification;
}

describe('masterNotificationsUtils', () => {
  describe('getNotificationStripeColor', () => {
    it('created → green stripe', () => {
      expect(getNotificationStripeColor('created')).toBe('#4CAF50');
    });
    it('updated → yellow stripe', () => {
      expect(getNotificationStripeColor('updated')).toBe('#E0A100');
    });
    it('cancelled → red stripe', () => {
      expect(getNotificationStripeColor('cancelled')).toBe('#E35D5B');
    });
  });

  describe('filterNotifications', () => {
    const items: MasterScheduleNotification[] = [
      n({ id: '1', type: 'created', isUnread: true }),
      n({ id: '2', type: 'updated', isUnread: false }),
      n({ id: '3', type: 'cancelled', isUnread: true }),
    ];

    it('all returns everything', () => {
      expect(filterNotifications(items, 'all')).toHaveLength(3);
    });
    it('new returns unread only', () => {
      expect(filterNotifications(items, 'new').map((x) => x.id)).toEqual(['1', '3']);
    });
    it('updated returns updated type', () => {
      expect(filterNotifications(items, 'updated')).toHaveLength(1);
      expect(filterNotifications(items, 'updated')[0].type).toBe('updated');
    });
    it('cancelled returns cancelled type', () => {
      expect(filterNotifications(items, 'cancelled')).toHaveLength(1);
    });
  });

  describe('applyViewedState', () => {
    it('removes unread dot for viewed ids', () => {
      const items = [n({ id: 'a', isUnread: true }), n({ id: 'b', isUnread: true })];
      const next = applyViewedState(items, new Set(['a']));
      expect(next[0].isUnread).toBe(false);
      expect(next[1].isUnread).toBe(true);
    });
  });

  describe('countUnreadNotifications', () => {
    it('returns 3 when all mock items unread', () => {
      const items = [n({ id: '1' }), n({ id: '2' }), n({ id: '3' })];
      expect(countUnreadNotifications(items)).toBe(3);
    });

    it('returns 0 when all viewed', () => {
      const items = [n({ id: '1' }), n({ id: '2' })];
      const viewed = applyViewedState(items, new Set(['1', '2']));
      expect(countUnreadNotifications(viewed)).toBe(0);
    });

    it('returns partial count when some viewed', () => {
      const items = [n({ id: '1' }), n({ id: '2' }), n({ id: '3' })];
      const partial = applyViewedState(items, new Set(['1', '2']));
      expect(countUnreadNotifications(partial)).toBe(1);
    });
  });

  describe('shouldShowNotificationsUnreadIndicator', () => {
    it('true when unreadCount > 0', () => {
      expect(shouldShowNotificationsUnreadIndicator(3)).toBe(true);
    });
    it('false when unreadCount = 0', () => {
      expect(shouldShowNotificationsUnreadIndicator(0)).toBe(false);
    });
  });

  describe('groupNotificationsByDate', () => {
    it('groups Today/Yesterday/date labels', () => {
      const items: MasterScheduleNotification[] = [
        n({ id: 't', createdAt: '2026-06-02T09:00:00.000Z' }),
        n({ id: 'y', createdAt: '2026-06-01T09:00:00.000Z' }),
        n({ id: 'd', createdAt: '2026-05-12T09:00:00.000Z' }),
      ];
      const sections = groupNotificationsByDate(items, NOW);
      expect(sections.map((s) => s.title)).toEqual(['Сегодня', 'Вчера', '12 мая']);
    });
  });

  describe('getNotificationGroupLabel', () => {
    it('returns Сегодня for same calendar day', () => {
      expect(getNotificationGroupLabel('2026-06-02T08:00:00.000Z', NOW)).toBe('Сегодня');
    });
  });
});
