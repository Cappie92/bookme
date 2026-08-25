"""Object-scope authorization for generic Booking GET/PUT/edit-request endpoints.

Deny-by-default. Explicit allow only for client / master / salon / indie
against the concrete Booking row. Admin, moderator, and unknown roles are denied.
Does not mutate Booking and does not commit.
"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models import Booking, IndieMaster, Master, Salon, SalonBranch, UserRole


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Бронирование не найдено",
    )


def _role_value(current_user) -> str:
    role = getattr(current_user, "role", None)
    if role is None:
        return ""
    if isinstance(role, UserRole):
        return role.value
    value = getattr(role, "value", None)
    if isinstance(value, str):
        return value
    return str(role)


def _client_owns(current_user, booking: Booking) -> bool:
    return booking.client_id is not None and booking.client_id == current_user.id


def _master_assigned(db: Session, current_user, booking: Booking) -> bool:
    master = db.query(Master).filter(Master.user_id == current_user.id).first()
    if master is None:
        return False
    return booking.master_id is not None and booking.master_id == master.id


def _salon_owns(db: Session, current_user, booking: Booking) -> bool:
    """Owner or branch-manager relation already used by generic GET/PUT."""
    salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
    if salon is not None:
        return booking.salon_id is not None and booking.salon_id == salon.id
    if booking.salon_id is None:
        return False
    branch = (
        db.query(SalonBranch)
        .filter(
            SalonBranch.manager_id == current_user.id,
            SalonBranch.salon_id == booking.salon_id,
        )
        .first()
    )
    if branch is None:
        return False
    if booking.branch_id and booking.branch_id != branch.id:
        return False
    return True


def _indie_related(db: Session, current_user, booking: Booking) -> bool:
    """IndieMaster.user_id plus booking.indie_master_id or booking.master_id."""
    indie = db.query(IndieMaster).filter(IndieMaster.user_id == current_user.id).first()
    if indie is None:
        return False
    if booking.indie_master_id is not None and booking.indie_master_id == indie.id:
        return True
    if booking.master_id is not None and booking.master_id == indie.master_id:
        return True
    return False


def assert_booking_object_scope(db: Session, current_user, booking: Booking) -> None:
    """Allow only a proven party of this Booking. Otherwise raise 404."""
    if current_user is None or booking is None:
        raise _not_found()

    role = _role_value(current_user)

    if role == UserRole.CLIENT.value:
        if _client_owns(current_user, booking):
            return
        raise _not_found()

    if role == UserRole.MASTER.value:
        if _master_assigned(db, current_user, booking):
            return
        raise _not_found()

    if role == UserRole.SALON.value:
        if _salon_owns(db, current_user, booking):
            return
        raise _not_found()

    if role == UserRole.INDIE.value:
        if _indie_related(db, current_user, booking):
            return
        raise _not_found()

    raise _not_found()
