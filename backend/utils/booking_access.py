"""Shared ownership boundary for booking and edit-request mutations."""
from fastapi import HTTPException
from models import IndieMaster, Master, Salon, SalonBranch, Service, UserRole


def deny_booking_access():
    raise HTTPException(403, "Доступ запрещён")


def require_booking_actor(db, user, booking):
    if booking is None:
        raise HTTPException(404, "Бронирование не найдено")
    if user.role == UserRole.ADMIN:
        return
    if user.role == UserRole.CLIENT:
        if booking.client_id == user.id:
            return
    elif user.role == UserRole.MASTER:
        if db.query(Master).filter(Master.id == booking.master_id, Master.user_id == user.id).first():
            return
    elif user.role == UserRole.INDIE:
        if db.query(IndieMaster).filter(
            IndieMaster.id == booking.indie_master_id, IndieMaster.user_id == user.id
        ).first():
            return
    elif user.role == UserRole.SALON:
        if db.query(Salon).filter(Salon.id == booking.salon_id, Salon.user_id == user.id).first():
            return
        if booking.branch_id and db.query(SalonBranch).filter(
            SalonBranch.id == booking.branch_id,
            SalonBranch.salon_id == booking.salon_id,
            SalonBranch.manager_id == user.id,
        ).first():
            return
    deny_booking_access()


def validate_booking_changes(db, user, booking, changes, *, client_flow=False):
    require_booking_actor(db, user, booking)
    if user.role == UserRole.ADMIN and not client_flow:
        return  # preserve explicit admin update authority
    changed = {key: value for key, value in changes.items() if value != getattr(booking, key)}
    if client_flow or user.role == UserRole.CLIENT:
        if set(changed) - {"start_time", "end_time", "status"}:
            deny_booking_access()
        if "status" in changed and changed["status"] != "cancelled":
            deny_booking_access()
    # Generic updates cannot transfer ownership. Salon reassignment is confined
    # to the original salon/branch and a master offering the selected service.
    owner_changes = set(changed) & {"master_id", "indie_master_id", "salon_id", "branch_id"}
    if owner_changes:
        if user.role != UserRole.SALON or owner_changes != {"master_id"}:
            deny_booking_access()
        target = db.query(Master).filter(Master.id == changed["master_id"]).first()
        if (
            not target or not any(s.id == booking.salon_id for s in target.salons)
            or (booking.branch_id and target.branch_id != booking.branch_id)
            or not any(s.id == changes.get("service_id", booking.service_id) for s in target.services)
        ):
            deny_booking_access()
    if "service_id" in changed:
        service = db.query(Service).filter(Service.id == changed["service_id"]).first()
        if not service:
            deny_booking_access()
        if user.role == UserRole.MASTER:
            if not any(m.id == booking.master_id for m in service.masters):
                deny_booking_access()
        elif user.role == UserRole.INDIE:
            if service.indie_master_id != booking.indie_master_id:
                deny_booking_access()
        elif user.role == UserRole.SALON:
            if service.salon_id != booking.salon_id:
                deny_booking_access()
