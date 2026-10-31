"""Master-only Calendar B3 routes. Occupancy is delegated to admission."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from auth import get_current_active_user
from database import get_db
from models import Master, User
from services.calendar_b3 import (
    BlockWrite,
    ManualWrite,
    create_calendar_block,
    create_manual_booking,
    delete_calendar_block,
    delete_manual_booking,
    list_calendar_blocks,
    update_calendar_block,
    update_manual_booking,
)
from sqlalchemy.orm import Session

router = APIRouter(prefix="/master", tags=["master-calendar-b3"])


class ManualBookingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_name: str = Field(min_length=1, max_length=255)
    start_time: datetime
    end_time: datetime
    client_phone: Optional[str] = None
    service_id: Optional[int] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class ManualBookingUpdate(ManualBookingIn):
    version: int = Field(ge=1)


class CalendarBlockIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_time: datetime
    end_time: datetime
    category: str = "personal"
    title: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = Field(default=None, max_length=1000)


class CalendarBlockUpdate(CalendarBlockIn):
    version: int = Field(ge=1)


def _master(db: Session, user: User) -> Master:
    role = getattr(user.role, "value", user.role)
    if str(role).lower() != "master":
        raise HTTPException(status_code=403, detail="Operation requires role: master")
    master = db.query(Master).filter(Master.user_id == user.id).first()
    if master is None:
        raise HTTPException(status_code=404, detail="Профиль мастера не найден")
    return master


def _blank(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _manual(body: ManualBookingIn, version: Optional[int] = None) -> ManualWrite:
    name = body.client_name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="client_name is required")
    return ManualWrite(
        client_name=name,
        start_time=body.start_time,
        end_time=body.end_time,
        client_phone=_blank(body.client_phone),
        service_id=body.service_id,
        notes=_blank(body.notes),
        version=version,
    )


def _block(body: CalendarBlockIn, version: Optional[int] = None) -> BlockWrite:
    return BlockWrite(
        start_time=body.start_time,
        end_time=body.end_time,
        category=(body.category or "personal").strip(),
        title=_blank(body.title),
        description=_blank(body.description),
        version=version,
    )


def _key(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    key = raw.strip()
    if not key:
        return None
    if len(key) > 255:
        raise HTTPException(status_code=400, detail="Idempotency-Key длиннее 255 символов")
    return key


@router.post("/bookings/manual")
def post_manual_booking(
    body: ManualBookingIn,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    master = _master(db, current_user)
    return create_manual_booking(db, master, current_user.id, _manual(body), _key(idempotency_key))


@router.put("/bookings/manual/{booking_id}")
def put_manual_booking(
    booking_id: int,
    body: ManualBookingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    master = _master(db, current_user)
    return update_manual_booking(db, master, booking_id, _manual(body, body.version))


@router.delete("/bookings/manual/{booking_id}")
def remove_manual_booking(
    booking_id: int,
    version: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    master = _master(db, current_user)
    return delete_manual_booking(db, master, booking_id, version)


@router.post("/calendar-blocks")
def post_calendar_block(
    body: CalendarBlockIn,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    master = _master(db, current_user)
    return create_calendar_block(db, master, current_user.id, _block(body), _key(idempotency_key))


@router.get("/calendar-blocks")
def get_calendar_blocks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    master = _master(db, current_user)
    return list_calendar_blocks(db, master)


@router.put("/calendar-blocks/{block_id}")
def put_calendar_block(
    block_id: int,
    body: CalendarBlockUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    master = _master(db, current_user)
    return update_calendar_block(db, master, block_id, _block(body, body.version))


@router.delete("/calendar-blocks/{block_id}")
def remove_calendar_block(
    block_id: int,
    version: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    master = _master(db, current_user)
    return delete_calendar_block(db, master, block_id, version)
