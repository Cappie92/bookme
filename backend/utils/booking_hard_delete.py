"""Правила admin hard-delete для Booking (чистая будущая бронь)."""
from __future__ import annotations

from datetime import datetime
from typing import List

from sqlalchemy.orm import Session

from models import (
    AppliedDiscount,
    Booking,
    BookingConfirmation,
    BookingEditRequest,
    BookingStatus,
    Income,
    LoyaltyTransaction,
    MissedRevenue,
)

# Статусы, при которых физическое удаление запрещено (история / terminal).
_BLOCKING_STATUSES = frozenset(
    {
        BookingStatus.COMPLETED.value,
        BookingStatus.CANCELLED.value,
        BookingStatus.CANCELLED_BY_CLIENT_EARLY.value,
        BookingStatus.CANCELLED_BY_CLIENT_LATE.value,
        BookingStatus.AWAITING_CONFIRMATION.value,
        BookingStatus.PAYMENT_EXPIRED.value,
    }
)

_HARD_DELETE_FORBIDDEN_MESSAGE = (
    "Физическое удаление запрещено: у брони есть финансовые, loyalty или исторические данные. "
    "Используйте отмену записи."
)


def _status_value(booking: Booking) -> str:
    status = booking.status
    if status is None:
        return ""
    return status.value if hasattr(status, "value") else str(status)


def get_hard_delete_blockers(db: Session, booking: Booking) -> List[str]:
    """
    Возвращает стабильные коды блокеров. Пустой список — hard delete разрешён.
    Application-level checks; не полагается на SQLite FK.
    """
    blockers: List[str] = []

    if booking.start_time is None:
        blockers.append("missing_start_time")
    elif booking.start_time <= datetime.utcnow():
        blockers.append("past_booking")

    status_val = _status_value(booking)
    if status_val in _BLOCKING_STATUSES:
        blockers.append("historical_status")

    if bool(booking.is_paid):
        blockers.append("is_paid")

    if int(booking.loyalty_points_used or 0) > 0:
        blockers.append("loyalty_reserve")

    if db.query(Income.id).filter(Income.booking_id == booking.id).first() is not None:
        blockers.append("income")

    if (
        db.query(MissedRevenue.id)
        .filter(MissedRevenue.booking_id == booking.id)
        .first()
        is not None
    ):
        blockers.append("missed_revenue")

    if (
        db.query(LoyaltyTransaction.id)
        .filter(LoyaltyTransaction.booking_id == booking.id)
        .first()
        is not None
    ):
        blockers.append("loyalty_transaction")

    if (
        db.query(AppliedDiscount.id)
        .filter(AppliedDiscount.booking_id == booking.id)
        .first()
        is not None
    ):
        blockers.append("applied_discount")

    if (
        db.query(BookingConfirmation.id)
        .filter(BookingConfirmation.booking_id == booking.id)
        .first()
        is not None
    ):
        blockers.append("booking_confirmation")

    return blockers


def hard_delete_forbidden_detail(blockers: List[str]) -> dict:
    return {
        "code": "BOOKING_HARD_DELETE_FORBIDDEN",
        "message": _HARD_DELETE_FORBIDDEN_MESSAGE,
        "blockers": blockers,
        "hint": "use_soft_cancel",
    }


def delete_clean_booking(db: Session, booking: Booking) -> None:
    """
    Удаляет BookingEditRequest и Booking в текущей сессии без commit.
    Вызывать только после пустого get_hard_delete_blockers.
    """
    db.query(BookingEditRequest).filter(
        BookingEditRequest.booking_id == booking.id
    ).delete(synchronize_session=False)
    db.delete(booking)
