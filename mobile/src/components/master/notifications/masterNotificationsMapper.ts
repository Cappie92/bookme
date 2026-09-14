import { isAxiosError } from 'axios';
import type { BackendNotification } from '@src/services/api/notifications';
import type {
  ClientStatus,
  MasterScheduleNotification,
  MasterScheduleNotificationType,
} from './notificationsTypes';

const BACKEND_TYPE_TO_VISUAL: Record<string, MasterScheduleNotificationType> = {
  booking_created: 'created',
  booking_cancelled: 'cancelled',
  booking_rescheduled: 'updated',
};

const ALLOWLISTED_DATA_KEYS = {
  client_name: 'clientName',
  service_name: 'serviceName',
  date_label: 'dateLabel',
  time_label: 'timeLabel',
  old_date_label: 'oldDateLabel',
  old_time_label: 'oldTimeLabel',
  new_date_label: 'newDateLabel',
  new_time_label: 'newTimeLabel',
} as const;

export type NotificationFetchErrorKind = 'unavailable' | 'network' | 'failed';

export function mapBackendNotificationType(type: string | null | undefined): MasterScheduleNotificationType {
  const key = (type ?? '').trim();
  return BACKEND_TYPE_TO_VISUAL[key] ?? 'updated';
}

function allowlistedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function allowlistedClientStatus(value: unknown): ClientStatus | undefined {
  return value === 'new' || value === 'returning' ? value : undefined;
}

/**
 * Backend title/body are the primary card copy.
 * `data` is allowlisted only — never phone / notes / tokens / arbitrary keys.
 */
export function mapBackendNotificationToViewModel(
  item: BackendNotification
): MasterScheduleNotification {
  const data = item.data && typeof item.data === 'object' ? item.data : null;
  const extras: Partial<MasterScheduleNotification> = {};
  if (data) {
    for (const [backendKey, viewKey] of Object.entries(ALLOWLISTED_DATA_KEYS)) {
      const value = allowlistedString(data[backendKey]);
      if (value) (extras as Record<string, string>)[viewKey] = value;
    }
    const status = allowlistedClientStatus(data.client_status);
    if (status) extras.clientStatus = status;
  }

  return {
    id: String(item.id),
    type: mapBackendNotificationType(item.type),
    title: (item.title ?? '').trim() || 'Уведомление',
    body: (item.body ?? '').trim(),
    isUnread: item.read_at == null || item.read_at === '',
    createdAt: item.created_at,
    ...extras,
  };
}

export function classifyNotificationFetchError(error: unknown): NotificationFetchErrorKind {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 404 || status === 503) return 'unavailable';
    if (!error.response) return 'network';
  }
  if (error instanceof Error && /network|timeout|offline/i.test(error.message)) return 'network';
  return 'failed';
}

export function parseNotificationId(id: string): number | null {
  const n = Number.parseInt(id, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function mergeNotificationPages(
  current: MasterScheduleNotification[],
  incoming: MasterScheduleNotification[]
): MasterScheduleNotification[] {
  const seen = new Set(current.map((item) => item.id));
  const next = [...current];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  return next;
}
