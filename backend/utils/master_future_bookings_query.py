"""
Единая семантика «будущих» записей мастера для SQL-фильтров и лимитов.

Будущая запись (строго start > now):
- если есть доказанный canonical (start_utc_us, end_utc_us и непустой time_zone) —
  сравнение момента с UTC now;
- иначе stored start_time сравнивается с naive UTC now, как раньше.
  Часовой пояс для такой строки не выводится.
Отменённые с тем же условием показываются в списке «все будущие» до наступления времени.
Активные (не отменённые) исключают completed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, or_

from models import Booking, BookingStatus
from services.calendar_time import canonical_instant


def cancelled_statuses_tuple() -> tuple[BookingStatus, ...]:
    return (
        BookingStatus.CANCELLED,
        BookingStatus.CANCELLED_BY_CLIENT_EARLY,
        BookingStatus.CANCELLED_BY_CLIENT_LATE,
    )


def inactive_future_statuses_tuple() -> tuple[Any, ...]:
    """Не входят во вкладку «Будущие» (бейдж и основной список дашборда)."""
    return cancelled_statuses_tuple() + (
        BookingStatus.COMPLETED,
        BookingStatus.PAYMENT_EXPIRED,
        # Legacy/imported rows can carry this string even though BookingStatus
        # never modeled it. Such rows must not consume active occupancy.
        "rejected",
    )


def _utc_now_pair(now_utc: datetime | None) -> tuple[datetime, int]:
    """Naive UTC clock and the same moment in epoch microseconds."""
    current = now_utc or datetime.utcnow()
    if current.tzinfo is not None:
        aware = current.astimezone(timezone.utc)
        naive = aware.replace(tzinfo=None)
    else:
        naive = current
        aware = current.replace(tzinfo=timezone.utc)
    return naive, canonical_instant(aware).epoch_microseconds


def _microseconds(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def has_proven_canonical(booking: Any) -> bool:
    """Complete canonical triple. A missing piece stays on the legacy comparison."""
    zone = getattr(booking, "time_zone", None)
    if not isinstance(zone, str) or not zone.strip():
        return False
    return _microseconds(getattr(booking, "start_utc_us", None)) is not None and (
        _microseconds(getattr(booking, "end_utc_us", None)) is not None
    )


def _legacy_start_digits(booking: Any) -> datetime | None:
    start = getattr(booking, "start_time", None)
    if not isinstance(start, datetime):
        return None
    if start.tzinfo is not None and start.utcoffset() is not None:
        return start.astimezone(timezone.utc).replace(tzinfo=None)
    return start.replace(tzinfo=None) if start.tzinfo is not None else start


def booking_starts_after(booking: Any, now_utc: datetime | None = None) -> bool:
    """start > now. Canonical instant when proven, otherwise stored digits vs UTC now."""
    naive, now_us = _utc_now_pair(now_utc)
    if has_proven_canonical(booking):
        return _microseconds(booking.start_utc_us) > now_us
    start = _legacy_start_digits(booking)
    return start is not None and start > naive


def booking_starts_before(booking: Any, now_utc: datetime | None = None) -> bool:
    """start < now. Same split as booking_starts_after. Equality is neither."""
    naive, now_us = _utc_now_pair(now_utc)
    if has_proven_canonical(booking):
        return _microseconds(booking.start_utc_us) < now_us
    start = _legacy_start_digits(booking)
    return start is not None and start < naive


def booking_start_elapsed(
    booking: Any, now_utc: datetime | None = None, *, minutes: int = 0
) -> bool:
    """now >= start + minutes. Used by the post-visit status transition."""
    naive, now_us = _utc_now_pair(now_utc)
    if has_proven_canonical(booking):
        return now_us >= _microseconds(booking.start_utc_us) + minutes * 60 * 1_000_000
    start = _legacy_start_digits(booking)
    return start is not None and naive >= start + timedelta(minutes=minutes)


def _proven_sql() -> Any:
    zone = func.length(func.trim(func.coalesce(Booking.time_zone, "")))
    return and_(
        Booking.start_utc_us.isnot(None),
        Booking.end_utc_us.isnot(None),
        zone > 0,
    )


def _legacy_sql() -> Any:
    zone = func.length(func.trim(func.coalesce(Booking.time_zone, "")))
    return or_(
        Booking.start_utc_us.is_(None),
        Booking.end_utc_us.is_(None),
        zone == 0,
    )


def start_after_now(now_utc: datetime | None = None) -> Any:
    naive, now_us = _utc_now_pair(now_utc)
    return or_(
        and_(_proven_sql(), Booking.start_utc_us > now_us),
        and_(_legacy_sql(), Booking.start_time > naive),
    )


def start_before_now(now_utc: datetime | None = None) -> Any:
    naive, now_us = _utc_now_pair(now_utc)
    return or_(
        and_(_proven_sql(), Booking.start_utc_us < now_us),
        and_(_legacy_sql(), Booking.start_time < naive),
    )


def start_at_or_before_now(now_utc: datetime | None = None) -> Any:
    naive, now_us = _utc_now_pair(now_utc)
    return or_(
        and_(_proven_sql(), Booking.start_utc_us <= now_us),
        and_(_legacy_sql(), Booking.start_time <= naive),
    )


def active_future_core(now_utc: datetime | None = None) -> Any:
    """Условие по времени и статусу для «активных» будущих (без привязки к владельцу)."""
    inactive = inactive_future_statuses_tuple()
    return and_(
        start_after_now(now_utc),
        Booking.status.notin_(inactive),
    )


def hub_cancelled_future_statuses_tuple() -> tuple[BookingStatus, ...]:
    """Вкладка «✕» в ЛК мастера: отменённые + истёкшая оплата (start_time ещё в будущем)."""
    return cancelled_statuses_tuple() + (BookingStatus.PAYMENT_EXPIRED,)


def cancelled_future_core(now_utc: datetime | None = None) -> Any:
    """Неактивные будущие для вкладки «✕» и для bookings[] в GET /bookings/future."""
    statuses = hub_cancelled_future_statuses_tuple()
    return and_(start_after_now(now_utc), Booking.status.in_(statuses))


def future_bookings_sql_filter(master: Any, now_utc: datetime | None = None) -> Any:
    """Владелец + активные будущие | отменённые будущие — для GET /bookings/future."""
    owner = or_(Booking.master_id == master.id, Booking.indie_master_id == master.id)
    return and_(owner, or_(active_future_core(now_utc), cancelled_future_core(now_utc)))


def active_future_bookings_sql_filter(master: Any, now_utc: datetime | None = None) -> Any:
    """Только неотменённые будущие без completed — дашборд, лимиты."""
    owner = or_(Booking.master_id == master.id, Booking.indie_master_id == master.id)
    return and_(owner, active_future_core(now_utc))


def free_cap_source_filter() -> Any:
    """Rows that consume Free capacity.

    NULL source is legacy history and still counts. Only an explicit manual
    booking is outside the cap. Blocks are not bookings and never reach here.
    """

    return or_(Booking.source.is_(None), Booking.source != "manual")


def active_future_bookings_cap_sql_filter(master: Any, now_utc: datetime | None = None) -> Any:
    """Active future rows that count toward the plan limit for one master."""

    return and_(active_future_bookings_sql_filter(master, now_utc), free_cap_source_filter())


def active_future_bookings_cap_owner_filter(
    *,
    master_id: int | None = None,
    indie_master_id: int | None = None,
    now_utc: datetime | None = None,
) -> Any:
    """Same owner scope as the active-future filter, excluding manual bookings."""

    return and_(
        active_future_bookings_owner_filter(
            master_id=master_id,
            indie_master_id=indie_master_id,
            now_utc=now_utc,
        ),
        free_cap_source_filter(),
    )


def active_future_bookings_owner_filter(
    *,
    master_id: int | None = None,
    indie_master_id: int | None = None,
    now_utc: datetime | None = None,
) -> Any:
    """Canonical active-future filter for an explicitly resolved booking owner."""
    owner_terms = []
    if master_id is not None:
        owner_terms.append(Booking.master_id == master_id)
    if indie_master_id is not None:
        owner_terms.append(Booking.indie_master_id == indie_master_id)
    if not owner_terms:
        raise ValueError("master_id or indie_master_id is required")
    return and_(or_(*owner_terms), active_future_core(now_utc))
