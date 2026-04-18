"""
Единый механизм определения owner и derived полей (salon_id, branch_id) для Booking.
НИГДЕ не задавать salon_id/branch_id вручную — только через normalize_booking_fields.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any, Literal

if TYPE_CHECKING:
    from models import Service
    from sqlalchemy.orm import Session


from utils.master_canon import LEGACY_INDIE_MODE

# master-only = not legacy. В master-only indie-booking запрещён (400).
OwnerType = Literal["indie", "salon", "master"]


class BookingOwnerError(ValueError):
    """Ошибка при нормализации owner-полей бронирования."""


def _resolve_indie_to_master(indie_id: int, db: "Session") -> int:
    """Резолв indie_master_id -> master_id через indie_masters.master_id. Raises если нельзя."""
    from models import IndieMaster
    im = db.query(IndieMaster).filter(IndieMaster.id == indie_id).first()
    if not im or im.master_id is None:
        raise BookingOwnerError(
            f"Cannot resolve indie_master_id={indie_id} to master_id. "
            "Use master_id in master-only mode."
        )
    return im.master_id


def normalize_booking_fields(
    booking_data: dict[str, Any],
    service: "Service",
    owner_type: OwnerType,
    owner_id: int,
    *,
    db: "Session | None" = None,
) -> dict[str, Any]:
    """
    Нормализует master_id, indie_master_id, salon_id, branch_id по owner_type.
    Мутирует и возвращает booking_data. Не задаёт другие поля.

    Rules:
    - owner_type='indie' => при LEGACY_INDIE_MODE=1: indie_master_id=owner_id.
      При master-only (LEGACY_INDIE_MODE=0): BookingOwnerError (400).
    - owner_type='master' => master_id=owner_id, indie_master_id=NULL, salon_id=NULL (solo)
    - owner_type='salon' => master_id=owner_id, indie_master_id=NULL,
      salon_id=service.salon_id, branch_id=первый SalonBranch салона (или NULL).
    """
    out = dict(booking_data)
    if owner_type == "indie":
        if LEGACY_INDIE_MODE:
            out["indie_master_id"] = owner_id
            out["master_id"] = None
            out["salon_id"] = None
            out["branch_id"] = None
        else:
            raise BookingOwnerError(
                "Indie bookings disabled. Use master_id. Set LEGACY_INDIE_MODE=1 for legacy."
            )
    elif owner_type == "master":
        out["master_id"] = owner_id
        out["indie_master_id"] = None
        out["salon_id"] = None
        out["branch_id"] = None
    elif owner_type == "salon":
        if service.salon_id is None:
            raise BookingOwnerError(
                "Salon booking requires service.salon_id; got indie service"
            )
        out["master_id"] = owner_id
        out["indie_master_id"] = None
        out["salon_id"] = service.salon_id
        out["branch_id"] = None
        if db is not None:
            from models import SalonBranch
            br = db.query(SalonBranch).filter(
                SalonBranch.salon_id == service.salon_id
            ).first()
            if br:
                out["branch_id"] = br.id
    else:
        raise BookingOwnerError(f"Unknown owner_type: {owner_type!r}")
    validate_booking_invariants(out)
    return out


def validate_booking_invariants(booking_data: dict[str, Any]) -> None:
    """
    Проверяет инварианты:
    A) ровно один владелец: (master_id IS NULL) != (indie_master_id IS NULL)
    B) если indie => salon_id/branch_id NULL
    C) если salon => salon_id NOT NULL
    """
    master_id = booking_data.get("master_id")
    indie_id = booking_data.get("indie_master_id")
    salon_id = booking_data.get("salon_id")
    branch_id = booking_data.get("branch_id")

    has_master = master_id is not None
    has_indie = indie_id is not None
    if has_master == has_indie:
        raise BookingOwnerError(
            "Exactly one of master_id, indie_master_id must be set"
        )
    if has_indie:
        if salon_id is not None or branch_id is not None:
            raise BookingOwnerError(
                "Indie booking must have salon_id=NULL and branch_id=NULL"
            )
    if has_master and salon_id is None:
        # Solo master: master_id без salon_id допустим
        pass
