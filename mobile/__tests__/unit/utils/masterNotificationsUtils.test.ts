import type { MasterScheduleNotification } from '@src/components/master/notifications/notificationsTypes';
import {
  filterNotifications,
  getNotificationEmptyCopy,
  getNotificationGroupLabel,
  getNotificationStripeColor,
  groupNotificationsByDate,
} from '@src/utils/masterNotificationsUtils';

const NOW = new Date('2026-06-02T12:00:00.000Z');

function n(
  partial: Partial<MasterScheduleNotification> & { id: string; type?: MasterScheduleNotification['type'] }
): MasterScheduleNotification {
  const type = partial.type ?? 'created';
  return {
    title: 'Уведомление',
    body: 'Изменение записи',
    clientName: 'Клиент',
    serviceName: 'Услуга',
    createdAt: '2026-06-02T10:00:00.000Z',
    ...partial,
    type,
  };
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
      n({ id: '1', type: 'created', createdAt: '2026-06-02T09:00:00.000Z' }),
      n({ id: '2', type: 'updated', createdAt: '2026-06-02T08:00:00.000Z' }),
      n({ id: '3', type: 'cancelled', createdAt: '2026-06-02T07:00:00.000Z' }),
      n({ id: '4', type: 'created', createdAt: '2026-06-01T07:00:00.000Z' }),
    ];

    it('all returns everything', () => {
      expect(filterNotifications(items, 'all').map((x) => x.id)).toEqual(['1', '2', '3', '4']);
    });

    it('Новые/new is booking_created only, not unread', () => {
      expect(filterNotifications(items, 'new').map((x) => x.id)).toEqual(['1', '4']);
      expect(filterNotifications(items, 'new').every((x) => x.type === 'created')).toBe(true);
    });

    it('does not put booking_rescheduled into Новые', () => {
      expect(filterNotifications(items, 'new').some((x) => x.type === 'updated')).toBe(false);
    });

    it('does not put booking_cancelled into Новые', () => {
      expect(filterNotifications(items, 'new').some((x) => x.type === 'cancelled')).toBe(false);
    });

    it('updated returns updated type', () => {
      expect(filterNotifications(items, 'updated')).toHaveLength(1);
      expect(filterNotifications(items, 'updated')[0].type).toBe('updated');
    });

    it('cancelled returns cancelled type', () => {
      expect(filterNotifications(items, 'cancelled')).toHaveLength(1);
    });
  });

  describe('getNotificationEmptyCopy', () => {
    it('has a distinct empty state per filter', () => {
      expect(getNotificationEmptyCopy('all').title).toBe('Уведомлений пока нет');
      expect(getNotificationEmptyCopy('new').title).toBe('Новых записей пока нет');
      expect(getNotificationEmptyCopy('updated').title).toBe('Изменений пока нет');
      expect(getNotificationEmptyCopy('cancelled').title).toBe('Отмен пока нет');
    });
  });

  describe('groupNotificationsByDate', () => {
    it('groups Today/Yesterday/date labels newest first', () => {
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
