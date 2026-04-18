"""
Сводка расширенной статистики (extended /stats).

Семантика (продукт):
- factual: прошлое в окне с финальным подтверждённым исходом — только COMPLETED
  (как bookings_confirmed / income_confirmed_rub в GET /dashboard/stats), не будущее.
- plan: весь будущий объём выбранного окна — все неисключённые записи со start >= now
  (и подтверждённые, и неподтверждённые до визита); единая модель «плана периода» для сводки.
- upcoming: подмножество plan — только pre-visit confirmed (обратная совместимость / отладка).
- period_total: полный объём периода = все неисключённые записи в [start, end] окна
  (= фактически factual-прошлое вне factual + plan + прочее прошлое в total; для сравнения и «Итого»
  используется как единый total периода).

Исключения — как у графиков dashboard (отмены, оплата и т.д.).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from models import Booking, BookingStatus


def _dash_excluded_status_values() -> frozenset:
    return frozenset(
        {
            BookingStatus.CANCELLED.value,
            BookingStatus.CANCELLED_BY_CLIENT_EARLY.value,
            BookingStatus.CANCELLED_BY_CLIENT_LATE.value,
            BookingStatus.PAYMENT_EXPIRED.value,
            BookingStatus.AWAITING_PAYMENT.value,
        }
    )


def booking_line_amount_rub(booking: Booking) -> float:
    """Как _amount_line в dashboard/stats: оплата или цена услуги."""
    pa = booking.payment_amount
    if pa is not None and pa > 0:
        return float(pa)
    sp = booking.service.price if booking.service else 0
    return float(sp or 0)


def _factual_status_values() -> frozenset:
    """Только завершённый post-visit исход — совпадает со «стеком подтверждённого» графика dashboard."""
    return frozenset({BookingStatus.COMPLETED.value})


def aggregate_extended_period_summary(bookings: List[Booking], now_utc: datetime) -> Dict[str, Any]:
    excluded = _dash_excluded_status_values()
    factual_ok = _factual_status_values()
    factual_rub = 0.0
    factual_n = 0
    plan_rub = 0.0
    plan_n = 0
    upcoming_rub = 0.0
    upcoming_n = 0
    total_rub = 0.0
    total_n = 0

    for b in bookings:
        st = b.start_time
        if st is None:
            continue
        if getattr(st, "tzinfo", None) is not None:
            st = st.replace(tzinfo=None)
        raw = b.status
        sv = raw.value if hasattr(raw, "value") else str(raw)
        if sv in excluded:
            continue
        amt = booking_line_amount_rub(b)
        total_rub += amt
        total_n += 1

        is_future = st >= now_utc
        if is_future:
            plan_rub += amt
            plan_n += 1
            # Подмножество plan: pre-visit confirmed
            if sv == BookingStatus.CONFIRMED.value:
                upcoming_rub += amt
                upcoming_n += 1
        else:
            # X: не «любая прошлая», а подтверждённый факт/этап исхода
            if sv in factual_ok:
                factual_rub += amt
                factual_n += 1

    return {
        "factual": {"revenue": factual_rub, "bookings_count": factual_n},
        "plan": {"revenue": plan_rub, "bookings_count": plan_n},
        "upcoming": {"revenue": upcoming_rub, "bookings_count": upcoming_n},
        "period_total": {"revenue": total_rub, "bookings_count": total_n},
    }
