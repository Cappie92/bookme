/**
 * Общий маппинг статусов записей для отображения бейджей.
 * Используется в AllBookingsModal, MasterDashboardStats и т.п.
 */
import { getBookingTab } from './bookingOutcome';

export const STATUS_LABELS = {
  completed: { label: 'Завершено', cls: 'bg-green-100 text-green-800' },
  confirmed: { label: 'Подтверждено', cls: 'bg-gray-100 text-gray-700' },
  created: { label: 'Создано', cls: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'Отменено', cls: 'bg-red-50 text-red-700' },
  cancelled_by_client_early: { label: 'Отменено', cls: 'bg-red-50 text-red-700' },
  cancelled_by_client_late: { label: 'Отменено', cls: 'bg-red-50 text-red-700' },
  awaiting_confirmation: { label: 'На подтверждении', cls: 'bg-amber-50 text-amber-800' },
};

/**
 * Возвращает { label, cls } для бейджа статуса прошедшей записи.
 * @param {object} booking - запись
 * @param {object} master - master settings (для needsOutcome)
 * @param {Date} now - текущее время
 */
export function getStatusBadgeForPast(booking, master, now = new Date()) {
  const tab = getBookingTab(booking, master, now);
  if (tab === 'pending') {
    return { label: 'На подтверждении', cls: 'bg-amber-50 text-amber-800' };
  }
  const s = String(booking.status || '').toLowerCase();
  return STATUS_LABELS[s] || { label: s || 'Прошло', cls: 'bg-gray-100 text-gray-600' };
}
