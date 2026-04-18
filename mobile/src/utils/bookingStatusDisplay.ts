/**
 * Маппинг статусов для прошедших записей (pending / past).
 * Используется в дашборде «Прошедшие записи» и в модалке «Все записи».
 * Единая терминология: Подтверждено / Отменено / На подтверждении.
 */

const PAST_STATUS_LABELS: Record<string, string> = {
  completed: 'Подтверждено',
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

/**
 * Лейбл для прошедших и pending записей.
 * completed/confirmed → «Подтверждено», cancelled* → «Отменено», created/awaiting_confirmation → «На подтверждении».
 */
export function getPastStatusLabel(status: string | null | undefined): string {
  const s = String(status ?? '').toLowerCase();
  return PAST_STATUS_LABELS[s] ?? status ?? '—';
}

/**
 * Цвет для прошедших и pending записей.
 */
export function getPastStatusColor(status: string | null | undefined): string {
  const s = String(status ?? '').toLowerCase();
  return PAST_STATUS_COLORS[s] ?? '#757575';
}
