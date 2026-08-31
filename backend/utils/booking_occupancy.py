"""Canonical booking slot occupancy shared by create and availability flows."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Query, Session

from models import Booking, BookingStatus, OwnerType


BOOKING_SLOT_CONFLICT_CODE = "BOOKING_SLOT_CONFLICT"
BOOKING_SLOT_CONFLICT_MESSAGE = "Выбранное время уже занято"

# These states explicitly release the interval. Completed is intentionally absent:
# auto-confirmed future bookings may use that status and must continue to occupy it.
NON_OCCUPYING_BOOKING_STATUSES = frozenset(
    {
        BookingStatus.CANCELLED.value,
        BookingStatus.CANCELLED_BY_CLIENT_EARLY.value,
        BookingStatus.CANCELLED_BY_CLIENT_LATE.value,
        BookingStatus.PAYMENT_EXPIRED.value,
        "rejected",
    }
)


def to_naive(value: datetime) -> datetime:
    return value.replace(tzinfo=None) if value.tzinfo is not None else value


def intervals_overlap(
    first_start: datetime,
    first_end: datetime,
    second_start: datetime,
    second_end: datetime,
) -> bool:
    """Half-open intersection: [start, end); touching boundaries are allowed."""
    first_start = to_naive(first_start)
    first_end = to_naive(first_end)
    second_start = to_naive(second_start)
    second_end = to_naive(second_end)
    return first_start < second_end and first_end > second_start


def apply_occupying_filter(query: Query) -> Query:
    return query.filter(~Booking.status.in_(tuple(NON_OCCUPYING_BOOKING_STATUSES)))


def has_overlapping_booking(
    db: Session,
    start_time: datetime,
    end_time: datetime,
    owner_type: OwnerType,
    owner_id: int,
    exclude_booking_id: Optional[int] = None,
) -> bool:
    query = apply_occupying_filter(db.query(Booking.id)).filter(
        Booking.start_time < to_naive(end_time),
        Booking.end_time > to_naive(start_time),
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
        master_id_list = [row[0] for row in master_ids]
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


def booking_slot_conflict(
    status_code: int = status.HTTP_409_CONFLICT,
) -> HTTPException:
    """Backward-compatible text detail plus a stable machine-readable header."""
    return HTTPException(
        status_code=status_code,
        detail=BOOKING_SLOT_CONFLICT_MESSAGE,
        headers={"X-Error-Code": BOOKING_SLOT_CONFLICT_CODE},
    )
