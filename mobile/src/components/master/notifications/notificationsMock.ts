import type { MasterScheduleNotification } from './notificationsTypes';

/** Dev-only preview data. Production uses empty list until backend schedule-events API exists. */
export const NOTIFICATIONS_USE_DEV_MOCK = __DEV__;

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

export const DEV_MOCK_SCHEDULE_NOTIFICATIONS: MasterScheduleNotification[] = [
  {
    id: 'mock-created-1',
    type: 'created',
    clientName: 'Анна Петрова',
    phone: '+7 900 111-22-33',
    serviceName: 'Стрижка',
    priceLabel: '2 500 ₽',
    isUnread: true,
    createdAt: hoursAgo(1),
    clientStatus: 'new',
    dateLabel: '3 июня',
    timeLabel: '14:00',
  },
  {
    id: 'mock-updated-1',
    type: 'updated',
    clientName: 'Мария Иванова',
    phone: '+7 900 444-55-66',
    serviceName: 'Окрашивание',
    priceLabel: '5 800 ₽',
    isUnread: true,
    createdAt: hoursAgo(3),
    oldDateLabel: '4 июня',
    oldTimeLabel: '11:00',
    newDateLabel: '5 июня',
    newTimeLabel: '15:30',
  },
  {
    id: 'mock-cancelled-1',
    type: 'cancelled',
    clientName: 'Елена Смирнова',
    phone: '+7 900 777-88-99',
    serviceName: 'Укладка',
    priceLabel: '1 800 ₽',
    isUnread: true,
    createdAt: hoursAgo(26),
    clientStatus: 'returning',
    dateLabel: '1 июня',
    timeLabel: '10:00',
  },
];
