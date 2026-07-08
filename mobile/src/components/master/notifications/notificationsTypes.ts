export type MasterScheduleNotificationType = 'created' | 'updated' | 'cancelled';

export type ClientStatus = 'new' | 'returning';

export type MasterScheduleNotificationBase = {
  id: string;
  type: MasterScheduleNotificationType;
  clientName: string;
  phone?: string | null;
  serviceName: string;
  priceLabel?: string | null;
  isUnread: boolean;
  createdAt?: string;
  groupLabel?: string;
};

export type CreatedNotification = MasterScheduleNotificationBase & {
  type: 'created';
  clientStatus: ClientStatus;
  dateLabel: string;
  timeLabel: string;
};

export type UpdatedNotification = MasterScheduleNotificationBase & {
  type: 'updated';
  oldDateLabel: string;
  oldTimeLabel: string;
  newDateLabel: string;
  newTimeLabel: string;
};

export type CancelledNotification = MasterScheduleNotificationBase & {
  type: 'cancelled';
  clientStatus: ClientStatus;
  dateLabel: string;
  timeLabel: string;
};

export type MasterScheduleNotification =
  | CreatedNotification
  | UpdatedNotification
  | CancelledNotification;

export type NotificationFilterKey = 'all' | 'new' | 'updated' | 'cancelled';
