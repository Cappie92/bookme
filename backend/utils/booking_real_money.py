"""
Денежная часть записи с учётом баллов: реальные деньги = payment_amount − loyalty_points_used.

Единая семантика для API мастера, дашборда и финализации (без изменения ЛК клиента).
"""
from __future__ import annotations

from typing import Any, Mapping, Optional


def booking_amount_to_pay(
    payment_amount: Optional[float],
    loyalty_points_used: Optional[int],
    *,
    service_price: Optional[float] = None,
) -> float:
    """К оплате деньгами: max(0, gross − loyalty), gross = payment_amount или service.price."""
    if payment_amount is not None and float(payment_amount) > 0:
        gross = float(payment_amount)
    else:
        gross = float(service_price or 0)
    lp = float(loyalty_points_used or 0)
    return max(0.0, gross - lp)


def booking_money_api_fields(
    booking: Any,
    *,
    service_price: Optional[float] = None,
) -> dict[str, Any]:
    """Поля для JSON ответов мастерских эндпоинтов (ORM Booking или mapping)."""
    pa = getattr(booking, "payment_amount", None)
    if pa is None and isinstance(booking, Mapping):
        pa = booking.get("payment_amount")
    lp = getattr(booking, "loyalty_points_used", None)
    if lp is None and isinstance(booking, Mapping):
        lp = booking.get("loyalty_points_used")
    lp_int = int(lp or 0)
    sp = service_price
    if sp is None:
        svc = getattr(booking, "service", None)
        if svc is not None:
            sp = getattr(svc, "price", None)
    atp = booking_amount_to_pay(pa, lp_int, service_price=sp)
    return {
        "payment_amount": pa,
        "loyalty_points_used": lp_int,
        "amount_to_pay": atp,
        "price": atp,
    }


def booking_gross_amount_sql(Booking, Service, func, case, and_):
    """Брутто до списания баллов: payment_amount если задан, иначе цена услуги."""
    return case(
        (
            and_(Booking.payment_amount.isnot(None), Booking.payment_amount > 0),
            Booking.payment_amount,
        ),
        else_=func.coalesce(Service.price, 0),
    )


def booking_real_money_sql(Booking, Service, func, case, and_):
    """SQL-выражение: max(0, gross − loyalty_points_used), без func.greatest (SQLite)."""
    gross = booking_gross_amount_sql(Booking, Service, func, case, and_)
    net = gross - func.coalesce(Booking.loyalty_points_used, 0)
    return case((net > 0, net), else_=0)
