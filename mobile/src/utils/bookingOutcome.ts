/**
 * Единый источник правды для подтверждения/отклонения записи.
 * Два типа confirm:
 * - pre-visit: мастер принимает будущую запись (update-booking-status)
 * - post-visit: мастер подтверждает, что услуга состоялась (confirm-booking)
 */

const DEBUG_CONFIRM_UI = false;

export const OUTCOME_PENDING_STATUSES = ['created', 'confirmed', 'awaiting_confirmation'] as const;

/** Причины отмены (совпадают с ограничениями клиента) */
export const CANCELLATION_REASONS: Record<string, string> = {
  client_requested: 'Клиент попросил отменить',
  client_no_show: 'Клиент не пришел',
  mutual_agreement: 'Обоюдное согласие',
  master_unavailable: 'Мастер недоступен',
};

export type BookingTab = 'future' | 'past' | 'pending';

interface BookingLike {
  start_time: string;
  status: string;
}

interface MasterLike {
  auto_confirm_bookings?: boolean;
  pre_visit_confirmations_enabled?: boolean;
  /** Как GET /api/master/settings — единый gate с backend и web (bookingOutcome.js). */
  pre_visit_confirmations_effective?: boolean;
}

/** Источник truth: у мастера включено ручное подтверждение */
export function requiresManualConfirmation(master: MasterLike | null): boolean {
  if (!master) return false;
  return master.auto_confirm_bookings === false || master.auto_confirm_bookings == null;
}

/** Группировать future на pending/confirmed (manual) или один список (auto). */
export function shouldSplitFutureBookingsByConfirmation(master: MasterLike | null): boolean {
  return requiresManualConfirmation(master);
}

/**
 * Запись в прошлом (start_time < now)
 */
export function isPast(booking: BookingLike, now: Date = new Date()): boolean {
  const raw = booking?.start_time;
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
export function needsOutcome(
  booking: BookingLike,
  master: MasterLike | null,
  now: Date = new Date()
): boolean {
  if (!master) return false;
  const past = isPast(booking, now);
  const status = String(booking.status || '').toLowerCase();
  return (
    past &&
    OUTCOME_PENDING_STATUSES.includes(status as (typeof OUTCOME_PENDING_STATUSES)[number])
  );
}

export function canConfirm(
  booking: BookingLike,
  master: MasterLike | null,
  now?: Date
): boolean {
  return needsOutcome(booking, master, now);
}

export function canCancel(
  booking: BookingLike,
  master: MasterLike | null,
  now?: Date
): boolean {
  return needsOutcome(booking, master, now);
}

/**
 * Запись можно отменить через API (CREATED или AWAITING_CONFIRMATION).
 */
export function canCancelBooking(booking: BookingLike | null): boolean {
  if (!booking) return false;
  const s = String(booking.status || '').toLowerCase();
  return (OUTCOME_PENDING_STATUSES as readonly string[]).includes(s);
}

/** Статусы секции «На подтверждении» для будущих записей — как isFuturePending (masterBookingShared). */
export function isFuturePendingConfirmationStatus(status: string | undefined | null): boolean {
  const s = String(status || '').toLowerCase();
  return s === 'created' || s === 'awaiting_confirmation';
}

/** Канон: зелёная галочка — future + ручной режим + статус «на подтверждении» (без тарифов/effective). */
export function canShowFutureConfirmAction(
  booking: BookingLike | null,
  master: MasterLike | null,
  now: Date = new Date()
): boolean {
  if (!booking || !master) return false;
  if (!requiresManualConfirmation(master)) return false;
  if (isPast(booking, now)) return false;
  return isFuturePendingConfirmationStatus(booking.status);
}

/**
 * Legacy: тарифный gate (не для показа зелёной галочки в списке будущих).
 */
export function canOfferPreVisitConfirm(master: MasterLike | null, _hasExtendedStats?: boolean): boolean {
  if (!master) return false;
  return master.pre_visit_confirmations_effective === true;
}

/** Pre-visit: то же, что canShowFutureConfirmAction. */
export function canConfirmPreVisit(
  booking: BookingLike | null,
  master: MasterLike | null,
  now: Date = new Date()
): boolean {
  return canShowFutureConfirmAction(booking, master, now);
}

export function canPreVisitConfirmBooking(
  booking: BookingLike | null,
  master: MasterLike | null,
  now: Date = new Date(),
  _hasExtendedStats = false
): boolean {
  return canShowFutureConfirmAction(booking, master, now);
}

/** Post-visit: показывать "Подтвердить" для прошлых CREATED/AWAITING (услуга состоялась). */
export function canConfirmPostVisit(
  booking: BookingLike | null,
  master: MasterLike | null,
  now: Date = new Date()
): boolean {
  return needsOutcome(booking, master, now);
}

/** Совместимость: post-visit confirm (confirm-booking). */
export function canConfirmBooking(
  booking: BookingLike | null,
  master: MasterLike | null,
  now?: Date
): boolean {
  return canConfirmPostVisit(booking, master, now);
}

export function debugConfirmUI(
  booking: BookingLike & { id?: number },
  master: MasterLike | null,
  context: string
): void {
  if (!DEBUG_CONFIRM_UI || !booking?.id) return;
  const now = new Date();
  const past = isPast(booking, now);
  const preVisit = canShowFutureConfirmAction(booking, master, now);
  const postVisit = canConfirmPostVisit(booking, master, now);
  console.log('[DEBUG_CONFIRM_UI]', context, {
    bookingId: booking.id,
    status: booking.status,
    start_time: (booking as any).start_time,
    now: now.toISOString(),
    isPast: past,
    auto_confirm_bookings: master?.auto_confirm_bookings,
    confirmType: preVisit ? 'pre_visit' : postVisit ? 'post_visit' : 'none',
    showConfirmPreVisit: preVisit,
    showConfirmPostVisit: postVisit,
  });
}

/**
 * Вкладка для группировки записей
 */
export function getBookingTab(
  booking: BookingLike,
  master: MasterLike | null,
  now: Date = new Date()
): BookingTab {
  if (needsOutcome(booking, master, now)) return 'pending';
  if (!isPast(booking, now)) return 'future';
  return 'past';
}
