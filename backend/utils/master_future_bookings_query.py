"""
Единая семантика «будущих» записей мастера для SQL-фильтров и лимитов.

Будущая запись:
- start_time > now (UTC)
- отменённые с тем же условием показываются в списке «все будущие» до наступления времени
- активные (не отменённые) исключают completed
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import and_, or_

from models import Booking, BookingStatus


def cancelled_statuses_tuple() -> tuple[BookingStatus, ...]:
    return (
        BookingStatus.CANCELLED,
        BookingStatus.CANCELLED_BY_CLIENT_EARLY,
        BookingStatus.CANCELLED_BY_CLIENT_LATE,
    )


def active_future_core(now_utc: datetime | None = None) -> Any:
    """Условие по времени и статусу для «активных» будущих (без привязки к владельцу)."""
    now = now_utc or datetime.utcnow()
    cancelled = cancelled_statuses_tuple()
    return and_(
        Booking.start_time > now,
        Booking.status.notin_(cancelled),
        Booking.status != BookingStatus.COMPLETED,
    )


def cancelled_future_core(now_utc: datetime | None = None) -> Any:
    """Отменённые, но время записи ещё не наступило."""
    now = now_utc or datetime.utcnow()
    cancelled = cancelled_statuses_tuple()
    return and_(Booking.start_time > now, Booking.status.in_(cancelled))


def future_bookings_sql_filter(master: Any, now_utc: datetime | None = None) -> Any:
    """Владелец + активные будущие | отменённые будущие — для GET /bookings/future."""
    owner = or_(Booking.master_id == master.id, Booking.indie_master_id == master.id)
    return and_(owner, or_(active_future_core(now_utc), cancelled_future_core(now_utc)))


def active_future_bookings_sql_filter(master: Any, now_utc: datetime | None = None) -> Any:
    """Только неотменённые будущие без completed — дашборд, лимиты."""
    owner = or_(Booking.master_id == master.id, Booking.indie_master_id == master.id)
    return and_(owner, active_future_core(now_utc))
