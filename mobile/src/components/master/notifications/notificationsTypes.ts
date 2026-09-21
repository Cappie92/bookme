export type MasterScheduleNotificationType = 'created' | 'updated' | 'cancelled';

export type ClientStatus = 'new' | 'returning';

/**
 * Backend-ready view model for the existing master notification cards.
 * title/body are required; structured extras are optional allowlisted data only.
 * Visual state is type-based — not read_at / unread.
 */
export type MasterScheduleNotification = {
  id: string;
  type: MasterScheduleNotificationType;
  title: string;
  body: string;
  createdAt?: string;
  groupLabel?: string;
  clientName?: string | null;
  serviceName?: string | null;
  clientStatus?: ClientStatus;
  dateLabel?: string;
  timeLabel?: string;
  oldDateLabel?: string;
  oldTimeLabel?: string;
  newDateLabel?: string;
  newTimeLabel?: string;
};

export type CreatedNotification = MasterScheduleNotification & { type: 'created' };
export type UpdatedNotification = MasterScheduleNotification & { type: 'updated' };
export type CancelledNotification = MasterScheduleNotification & { type: 'cancelled' };

export type NotificationFilterKey = 'all' | 'new' | 'updated' | 'cancelled';
