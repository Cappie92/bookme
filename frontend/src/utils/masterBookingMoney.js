/**
 * Деньги по записи в ЛК мастера: реальная к оплате = payment_amount − loyalty_points_used.
 * Совместимо с API после появления amount_to_pay / loyalty_points_used.
 */

export function masterLoyaltyRub(booking) {
  const n = Number(booking?.loyalty_points_used ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Основная сумма «к оплате деньгами» (для карточек и дохода мастера). */
export function masterDisplayMainRub(booking) {
  if (booking?.amount_to_pay != null && booking.amount_to_pay !== '') {
    const n = Number(booking.amount_to_pay);
    if (Number.isFinite(n)) return n;
  }
  const pay = Number(booking?.payment_amount ?? 0);
  const pts = masterLoyaltyRub(booking);
  if (pay > 0 || pts > 0) return Math.max(0, pay - pts);
  const svc = Number(booking?.service_price ?? 0);
  return Number.isFinite(svc) && svc > 0 ? svc : 0;
}
