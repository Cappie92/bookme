/**
 * Единый источник правды для подтверждения/отклонения записи.
 * pre-visit: мастер принимает будущую запись.
 * post-visit: мастер подтверждает, что услуга состоялась.
 */

const DEBUG_CONFIRM_UI = false;

export const OUTCOME_PENDING_STATUSES = ['created', 'confirmed', 'awaiting_confirmation'];

/** Источник truth: у мастера включено ручное подтверждение */
export function requiresManualConfirmation(master) {
  if (!master) return false
  return master.auto_confirm_bookings === false || master.auto_confirm_bookings == null
}

/**
 * Разделять ли будущие записи на «На подтверждении» / «Подтверждённые» в UI.
 * true только при ручном режиме; при авто — единый список по времени.
 */
export function shouldSplitFutureBookingsByConfirmation(master) {
  return requiresManualConfirmation(master)
}

/** Причины отмены (совпадают с ограничениями клиента) */
export const CANCELLATION_REASONS = {
  client_requested: 'Клиент попросил отменить',
  client_no_show: 'Клиент не пришел',
  mutual_agreement: 'Обоюдное согласие',
  master_unavailable: 'Мастер недоступен',
};

/**
 * Запись в прошлом (start_time < now)
 * start_time — приоритет (ISO от API); date — legacy fallback для старых ответов.
 */
export function isPast(booking, now = new Date()) {
  const raw = booking?.start_time ?? booking?.date;
  if (raw == null || raw === '') return false;
  const start = new Date(raw).getTime();
  if (Number.isNaN(start)) return false;
  return start < now.getTime();
}

/**
 * Требует решения мастера: "Прошла" / "Не состоялась" (post-visit, финансы).
 * НЕ включает COMPLETED.
 * Не зависит от автоподтверждения новых записей — только прошлое + статус.
 */
export function needsOutcome(booking, master, now = new Date()) {
  if (!master) return false;
  const past = isPast(booking, now);
  const status = String(booking.status || '').toLowerCase();
  return past && OUTCOME_PENDING_STATUSES.includes(status);
}

/** Алиас для needsOutcome — предикат блока B */
export const isNeedsConfirmation = needsOutcome;

export function canConfirm(booking, master, now) {
  return needsOutcome(booking, master, now);
}

/**
 * Статусы будущей записи в секции «На подтверждении» — совпадает с isFuturePending (masterBookingShared.jsx).
 */
export function isFuturePendingConfirmationStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'created' || s === 'awaiting_confirmation';
}

/**
 * Каноническое правило зелёной галочки (будущие, ручное подтверждение, без тарифов / effective / extended stats).
 */
export function canShowFutureConfirmAction(booking, master, now = new Date()) {
  if (!booking || !master) return false;
  if (!requiresManualConfirmation(master)) return false;
  if (isPast(booking, now)) return false;
  return isFuturePendingConfirmationStatus(booking.status);
}

/**
 * Legacy: тарифный/флаговый gate для прочих сценариев (не для показа зелёной галочки в списке будущих).
 * GET /api/master/settings → master.pre_visit_confirmations_effective
 */
export function canOfferPreVisitConfirm(master, _hasExtendedStats) {
  if (!master) return false;
  return master.pre_visit_confirmations_effective === true;
}

/** Pre-visit: то же продуктовое правило, что canShowFutureConfirmAction (created | awaiting_confirmation, future, manual). */
export function canConfirmPreVisit(booking, master, now = new Date()) {
  return canShowFutureConfirmAction(booking, master, now);
}

/** Pre-visit кнопка в UI: только canShowFutureConfirmAction; аргумент hasExtendedStats игнорируется. */
export function canPreVisitConfirmBooking(booking, master, now = new Date(), _hasExtendedStats = false) {
  return canShowFutureConfirmAction(booking, master, now);
}

/** Post-visit: прошлые CREATED/AWAITING (услуга состоялась). */
export function canConfirmPostVisit(booking, master, now = new Date()) {
  return needsOutcome(booking, master, now);
}

export function canConfirmBooking(booking, master, now = new Date()) {
  return canConfirmPostVisit(booking, master, now);
}

export function debugConfirmUI(booking, master, context) {
  if (!DEBUG_CONFIRM_UI || !booking?.id) return;
  const now = new Date();
  const past = isPast(booking, now);
  const preVisit = canShowFutureConfirmAction(booking, master, now);
  const postVisit = canConfirmPostVisit(booking, master, now);
  console.log('[DEBUG_CONFIRM_UI]', context, {
    bookingId: booking.id,
    status: booking.status,
    start_time: booking?.start_time,
    now: now.toISOString(),
    isPast: past,
    auto_confirm_bookings: master?.auto_confirm_bookings,
    confirmType: preVisit ? 'pre_visit' : postVisit ? 'post_visit' : 'none',
    showConfirmPreVisit: preVisit,
    showConfirmPostVisit: postVisit
  });
}

export function canCancel(booking, master, now) {
  return needsOutcome(booking, master, now);
}

/**
 * Вкладка для группировки записей: pending | future | past
 */
export function getBookingTab(booking, master, now = new Date()) {
  if (needsOutcome(booking, master, now)) return 'pending'
  if (!isPast(booking, now)) return 'future'
  return 'past'
}

/**
 * Запись можно отменить через API (CREATED или AWAITING_CONFIRMATION).
 * Используется для кнопки "Отменить запись" (будущие и прошлые).
 */
export function canCancelBooking(booking) {
  if (!booking) return false;
  const s = String(booking.status || '').toLowerCase();
  return OUTCOME_PENDING_STATUSES.includes(s);
}
