"""Transactional, API-independent guard for active future booking limits."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping

from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from models import (
    Booking,
    BookingStatus,
    IndieMaster,
    Master,
    SubscriptionPlan,
    SubscriptionType,
    User,
)
from utils.master_future_bookings_query import (
    active_future_bookings_owner_filter,
    inactive_future_statuses_tuple,
)
from utils.subscription_features import get_active_subscription_readonly


FREE_ACTIVE_FUTURE_BOOKINGS_LIMIT = 20
BOOKING_LIMIT_ERROR_CODE = "free_active_booking_limit_reached"
BOOKING_LIMIT_ERROR_MESSAGE = "Достигнут лимит 20 активных будущих записей."
BOOKING_SLOT_BUSY_CODE = "BOOKING_SLOT_BUSY"
BOOKING_SLOT_BUSY_MESSAGE = "Сервис временно недоступен, повторите попытку"


def begin_booking_creation_transaction(db: Session) -> None:
    """Acquire SQLite's write reservation before any route-level booking reads.

    Auth dependencies may already have opened a read-only transaction. At the very
    beginning of a creation endpoint it is safe to close that transaction and start
    BEGIN IMMEDIATE. PostgreSQL uses an owner-row lock in the policy check instead.
    """
    if db.info.get("booking_creation_transaction"):
        return
    bind = db.get_bind()
    if bind.dialect.name == "sqlite":
        if db.in_transaction():
            if db.new or db.dirty or db.deleted:
                raise RuntimeError("booking guard must begin before route mutations")
            db.rollback()
        try:
            db.execute(text("BEGIN IMMEDIATE"))
        except OperationalError as exc:
            db.rollback()
            message = str(exc).lower()
            if "database is locked" in message or "database is busy" in message:
                raise HTTPException(
                    status_code=503,
                    detail=BOOKING_SLOT_BUSY_MESSAGE,
                    headers={
                        "X-Error-Code": BOOKING_SLOT_BUSY_CODE,
                        "Retry-After": "1",
                    },
                ) from exc
            raise
    db.info["booking_creation_transaction"] = True


def _resolved_owner(db: Session, data: Mapping[str, Any]) -> tuple[Master, int | None]:
    master_id = data.get("master_id")
    indie_id = data.get("indie_master_id")
    if master_id is not None:
        query = db.query(Master).filter(Master.id == int(master_id))
        if db.get_bind().dialect.name != "sqlite":
            query = query.with_for_update()
        master = query.first()
        if not master:
            raise HTTPException(status_code=404, detail="Master not found")
        indie = db.query(IndieMaster).filter(IndieMaster.master_id == master.id).first()
        return master, indie.id if indie else None
    if indie_id is not None:
        indie = db.query(IndieMaster).filter(IndieMaster.id == int(indie_id)).first()
        if not indie:
            raise HTTPException(status_code=404, detail="Indie master not found")
        query = db.query(Master).filter(Master.id == indie.master_id)
        if db.get_bind().dialect.name != "sqlite":
            query = query.with_for_update()
        master = query.first()
        if not master:
            raise HTTPException(status_code=404, detail="Master not found")
        return master, indie.id
    raise HTTPException(status_code=400, detail="master_id or indie_master_id required")


def _booking_will_be_active(data: Mapping[str, Any], now_utc: datetime) -> bool:
    start_time = data.get("start_time")
    if not isinstance(start_time, datetime):
        return False
    comparable_start = (
        start_time.astimezone(timezone.utc).replace(tzinfo=None)
        if start_time.tzinfo is not None
        else start_time
    )
    comparable_now = (
        now_utc.astimezone(timezone.utc).replace(tzinfo=None)
        if now_utc.tzinfo is not None
        else now_utc
    )
    if comparable_start <= comparable_now:
        return False
    raw_status = data.get("status", BookingStatus.CREATED.value)
    normalized = getattr(raw_status, "value", raw_status)
    inactive = {getattr(status, "value", status) for status in inactive_future_statuses_tuple()}
    return normalized not in inactive


def _limit_for_user(db: Session, user: User, now_utc: datetime) -> int | None:
    if user.is_always_free:
        return None
    subscription = get_active_subscription_readonly(
        db, user.id, SubscriptionType.MASTER, now_utc=now_utc
    )
    if not subscription or not subscription.plan_id:
        return FREE_ACTIVE_FUTURE_BOOKINGS_LIMIT
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == subscription.plan_id).first()
    if not plan or plan.name == "Free":
        return FREE_ACTIVE_FUTURE_BOOKINGS_LIMIT
    raw_limit = (plan.limits or {}).get("max_future_bookings")
    return int(raw_limit) if isinstance(raw_limit, (int, float)) and raw_limit > 0 else None


def enforce_booking_creation_limit(
    db: Session,
    booking_data: Mapping[str, Any],
    *,
    now_utc: datetime | None = None,
) -> None:
    """Reject a new booking if it would exceed the resolved owner's active limit."""
    if not db.info.get("booking_creation_transaction"):
        raise RuntimeError("begin_booking_creation_transaction must be called first")
    now = now_utc or datetime.utcnow()
    if not _booking_will_be_active(booking_data, now):
        return
    master, indie_id = _resolved_owner(db, booking_data)
    user = db.query(User).filter(User.id == master.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Master user not found")
    limit = _limit_for_user(db, user, now)
    if limit is None:
        return
    count = (
        db.query(func.count(Booking.id))
        .filter(
            active_future_bookings_owner_filter(
                master_id=master.id,
                indie_master_id=indie_id,
                now_utc=now,
            )
        )
        .scalar()
        or 0
    )
    if count >= limit:
        raise HTTPException(
            status_code=409,
            detail={
                "code": BOOKING_LIMIT_ERROR_CODE,
                "message": BOOKING_LIMIT_ERROR_MESSAGE,
                "limit": limit,
            },
        )
