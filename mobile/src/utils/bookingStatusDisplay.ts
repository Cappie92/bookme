/**
 * Маппинг статусов для прошедших записей (pending / past).
 * Используется в дашборде «Прошедшие записи» и в модалке «Все записи».
 */

import { needsOutcome } from './bookingOutcome';

interface BookingLike {
  start_time: string;
  status: string;
}

interface MasterLike {
  auto_confirm_bookings?: boolean;
  pre_visit_confirmations_enabled?: boolean;
  pre_visit_confirmations_effective?: boolean;
}

const PAST_STATUS_LABELS: Record<string, string> = {
  completed: 'Завершено',
  confirmed: 'Подтверждено',
  created: 'На подтверждении',
  awaiting_confirmation: 'На подтверждении',
  cancelled: 'Отменено',
  cancelled_by_client_early: 'Отменено',
  cancelled_by_client_late: 'Отменено',
  awaiting_payment: 'Ожидает оплаты',
  payment_expired: 'Оплата просрочена',
};

const PAST_STATUS_COLORS: Record<string, string> = {
  completed: '#4CAF50',
  confirmed: '#4CAF50',
  created: '#FF9800',
  awaiting_confirmation: '#FF9800',
  cancelled: '#F44336',
  cancelled_by_client_early: '#F44336',
  cancelled_by_client_late: '#F44336',
  awaiting_payment: '#FFC107',
  payment_expired: '#F44336',
};

const PENDING_OUTCOME_LABEL = 'На подтверждении';
const PENDING_OUTCOME_COLOR = '#FF9800';

/**
 * Низкоуровневый лейбл по raw status (без учёта post-visit outcome).
 */
export function getPastStatusLabel(status: string | null | undefined): string {
  const s = String(status ?? '').toLowerCase();
  return PAST_STATUS_LABELS[s] ?? status ?? '—';
}

/**
 * Низкоуровневый цвет по raw status (без учёта post-visit outcome).
 */
export function getPastStatusColor(status: string | null | undefined): string {
  const s = String(status ?? '').toLowerCase();
  return PAST_STATUS_COLORS[s] ?? '#757575';
}

/**
 * Лейбл прошедшей записи с учётом post-visit outcome (needsOutcome).
 * Для будущих записей не подменяет статус на «На подтверждении».
 */
export function getPastBookingStatusLabel(
  booking: BookingLike | null | undefined,
  master: MasterLike | null,
  now: Date = new Date()
): string {
  if (!booking) return '—';
  if (needsOutcome(booking, master, now)) {
    return PENDING_OUTCOME_LABEL;
  }
  const s = String(booking.status ?? '').toLowerCase();
  if (s === 'completed') {
    return 'Завершено';
  }
  return getPastStatusLabel(booking.status);
}

/**
 * Цвет бейджа прошедшей записи с учётом post-visit outcome.
 */
export function getPastBookingStatusColor(
  booking: BookingLike | null | undefined,
  master: MasterLike | null,
  now: Date = new Date()
): string {
  if (!booking) return '#757575';
  if (needsOutcome(booking, master, now)) {
    return PENDING_OUTCOME_COLOR;
  }
  return getPastStatusColor(booking.status);
}
