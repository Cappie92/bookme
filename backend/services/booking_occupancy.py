"""
Unified Booking slot occupancy.

Overlap: existing.start_time < requested.end_time
         AND existing.end_time > requested.start_time
Touching boundaries (end == start) are allowed.

completed occupies the interval: auto-confirm create paths persist future
rows as completed, so treating completed as free would reopen double-booking.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Query, Session

from models import Booking, BookingStatus, OwnerType

NON_OCCUPYING_BOOKING_STATUSES = frozenset(
    {
        BookingStatus.CANCELLED.value,
        BookingStatus.CANCELLED_BY_CLIENT_EARLY.value,
        BookingStatus.CANCELLED_BY_CLIENT_LATE.value,
        BookingStatus.PAYMENT_EXPIRED.value,
        "rejected",
    }
)


def to_naive(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


def status_value(status) -> str:
    if status is None:
        return ""
    return status.value if hasattr(status, "value") else str(status)


def is_occupying_status(status) -> bool:
    return status_value(status) not in NON_OCCUPYING_BOOKING_STATUSES


def apply_occupying_filter(query: Query) -> Query:
    return query.filter(~Booking.status.in_(tuple(NON_OCCUPYING_BOOKING_STATUSES)))


def intervals_overlap(
    start1: datetime, end1: datetime, start2: datetime, end2: datetime
) -> bool:
    s1, e1 = to_naive(start1), to_naive(end1)
    s2, e2 = to_naive(start2), to_naive(end2)
    return s1 < e2 and e1 > s2


def owner_from_ids(
    master_id: Optional[int],
    indie_master_id: Optional[int],
    salon_id: Optional[int],
) -> tuple[OwnerType, int]:
    if master_id is not None:
        return OwnerType.MASTER, master_id
    if indie_master_id is not None:
        return OwnerType.INDIE_MASTER, indie_master_id
    if salon_id is not None:
        return OwnerType.SALON, salon_id
    raise ValueError("master_id, indie_master_id or salon_id is required")


def has_overlapping_booking(
    db: Session,
    start_time: datetime,
    end_time: datetime,
    owner_type: OwnerType,
    owner_id: int,
    exclude_booking_id: Optional[int] = None,
) -> bool:
    start_time = to_naive(start_time)
    end_time = to_naive(end_time)

    query = apply_occupying_filter(db.query(Booking.id)).filter(
        Booking.start_time < end_time,
        Booking.end_time > start_time,
    )

    if owner_type == OwnerType.MASTER:
        query = query.filter(Booking.master_id == owner_id)
    elif owner_type == OwnerType.INDIE_MASTER:
        query = query.filter(Booking.indie_master_id == owner_id)
    else:
        from models import salon_masters
        from sqlalchemy import or_

        master_ids = (
            db.query(salon_masters.c.master_id)
            .filter(salon_masters.c.salon_id == owner_id)
            .all()
        )
        master_id_list = [m[0] for m in master_ids]
        if master_id_list:
            query = query.filter(
                or_(
                    Booking.salon_id == owner_id,
                    Booking.master_id.in_(master_id_list),
                )
            )
        else:
            query = query.filter(Booking.salon_id == owner_id)

    if exclude_booking_id is not None:
        query = query.filter(Booking.id != exclude_booking_id)

    return query.first() is not None
