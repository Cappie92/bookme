import type { MasterScheduleNotification } from './notificationsTypes';

/**
 * Test/story fixture only. The production hook always uses the backend API
 * (`useMasterNotifications` never auto-loads this list, including in __DEV__).
 */
export const NOTIFICATIONS_USE_DEV_MOCK = false;

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

export const DEV_MOCK_SCHEDULE_NOTIFICATIONS: MasterScheduleNotification[] = [
  {
    id: 'mock-created-1',
    type: 'created',
    title: 'Новая запись',
    body: 'Клиент записался на стрижку',
    clientName: 'Анна Петрова',
    serviceName: 'Стрижка',
    createdAt: hoursAgo(1),
    clientStatus: 'new',
    dateLabel: '3 июня',
    timeLabel: '14:00',
  },
  {
    id: 'mock-updated-1',
    type: 'updated',
    title: 'Запись перенесена',
    body: 'Клиент перенёс окрашивание',
    clientName: 'Мария Иванова',
    serviceName: 'Окрашивание',
    createdAt: hoursAgo(3),
    oldDateLabel: '4 июня',
    oldTimeLabel: '11:00',
    newDateLabel: '5 июня',
    newTimeLabel: '15:30',
  },
  {
    id: 'mock-cancelled-1',
    type: 'cancelled',
    title: 'Запись отменена',
    body: 'Клиент отменил укладку',
    clientName: 'Елена Смирнова',
    serviceName: 'Укладка',
    createdAt: hoursAgo(26),
    clientStatus: 'returning',
    dateLabel: '1 июня',
    timeLabel: '10:00',
  },
];
