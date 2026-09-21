import type {
  MasterScheduleNotification,
  NotificationFilterKey,
} from '@src/components/master/notifications/notificationsTypes';

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function getNotificationGroupLabel(isoDate: string | undefined, now: Date = new Date()): string {
  if (!isoDate) return 'Ранее';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'Ранее';

  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const target = startOfDay(d);

  if (target.getTime() === today.getTime()) return 'Сегодня';
  if (target.getTime() === yesterday.getTime()) return 'Вчера';
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`;
}

/**
 * Type-based Notification Center filters.
 * "Новые" is booking_created (`created`), not unread / read_at.
 */
export function filterNotifications(
  items: MasterScheduleNotification[],
  filter: NotificationFilterKey
): MasterScheduleNotification[] {
  switch (filter) {
    case 'new':
      return items.filter((n) => n.type === 'created');
    case 'updated':
      return items.filter((n) => n.type === 'updated');
    case 'cancelled':
      return items.filter((n) => n.type === 'cancelled');
    default:
      return items;
  }
}

export function getNotificationEmptyCopy(filter: NotificationFilterKey): { title: string; text: string } {
  switch (filter) {
    case 'new':
      return {
        title: 'Новых записей пока нет',
        text: 'Здесь появятся уведомления о новых записях',
      };
    case 'updated':
      return {
        title: 'Изменений пока нет',
        text: 'Здесь появятся уведомления о переносах записей',
      };
    case 'cancelled':
      return {
        title: 'Отмен пока нет',
        text: 'Здесь появятся уведомления об отменах записей',
      };
    default:
      return {
        title: 'Уведомлений пока нет',
        text: 'Здесь будут изменения по новым, перенесённым и отменённым записям',
      };
  }
}

export function getNotificationStripeColor(type: MasterScheduleNotification['type']): string {
  switch (type) {
    case 'created':
      return '#4CAF50';
    case 'updated':
      return '#E0A100';
    case 'cancelled':
      return '#E35D5B';
    default:
      return '#4CAF50';
  }
}

export type NotificationSection = {
  title: string;
  data: MasterScheduleNotification[];
};

export function groupNotificationsByDate(
  items: MasterScheduleNotification[],
  now: Date = new Date()
): NotificationSection[] {
  const sorted = [...items].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });

  const map = new Map<string, MasterScheduleNotification[]>();
  for (const item of sorted) {
    const title = getNotificationGroupLabel(item.createdAt, now);
    const bucket = map.get(title) ?? [];
    bucket.push(item);
    map.set(title, bucket);
  }

  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}
