"""Persistent in-app booking notifications plus same-transaction outbox fan-out.

No Expo HTTP, worker, or receipts.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Mapping, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from models import Booking, BookingStatus, IndieMaster, Master, Service
from services.notifications import create_notification
from services.push_outbox import fanout_notification_to_active_devices

logger = logging.getLogger("dedato.notifications")

_FALLBACK_TZ = "Europe/Moscow"
_FALLBACK_SERVICE = "Услуга"
_MONTHS_GENITIVE = (
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
)
_CANCEL_STATUSES = frozenset(
    {
        BookingStatus.CANCELLED.value,
        BookingStatus.CANCELLED_BY_CLIENT_EARLY.value,
        BookingStatus.CANCELLED_BY_CLIENT_LATE.value,
        "cancelled",
        "cancelled_by_client_early",
        "cancelled_by_client_late",
    }
)


def _status_value(status: Any) -> str:
    if status is None:
        return ""
    return str(getattr(status, "value", status) or "").strip().lower()


def is_cancel_status(status: Any) -> bool:
    return _status_value(status) in _CANCEL_STATUSES


def _start_key(value: Optional[datetime]) -> str:
    if value is None:
        return ""
    dt = value.replace(microsecond=0)
    if dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None)
    return dt.isoformat()


def same_schedule_instant(left: Optional[datetime], right: Optional[datetime]) -> bool:
    return _start_key(left) == _start_key(right)


def _master_zoneinfo(db: Session, master_id: Optional[int]) -> ZoneInfo:
    name = _FALLBACK_TZ
    if master_id is not None:
        master = db.query(Master).filter(Master.id == master_id).first()
        raw = (getattr(master, "timezone", None) or "").strip() if master else ""
        if raw:
            name = raw
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo(_FALLBACK_TZ)


def _wall_datetime(value: Optional[datetime], tz: ZoneInfo) -> Optional[datetime]:
    """Naive booking times are business wall-clock (scheduling contract)."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(microsecond=0)
    return value.astimezone(tz).replace(tzinfo=None, microsecond=0)


def _date_label(value: Optional[datetime]) -> str:
    if value is None:
        return ""
    month = _MONTHS_GENITIVE[value.month - 1] if 1 <= value.month <= 12 else ""
    return f"{value.day} {month}".strip()


def _time_label(value: Optional[datetime]) -> str:
    if value is None:
        return ""
    return value.strftime("%H:%M")


def _service_name(db: Session, booking: Booking) -> str:
    try:
        service = getattr(booking, "service", None)
        if service is None and booking.service_id:
            service = db.query(Service).filter(Service.id == booking.service_id).first()
        name = (getattr(service, "name", None) or "").strip()
        return name or _FALLBACK_SERVICE
    except Exception:
        return _FALLBACK_SERVICE


def recipient_user_id(db: Session, booking: Booking) -> Optional[int]:
    """Authoritative master owner: booking.master_id → Master.user_id."""
    if booking.master_id:
        master = db.query(Master).filter(Master.id == booking.master_id).first()
        if master and isinstance(master.user_id, int):
            return master.user_id
    if booking.indie_master_id:
        indie = db.query(IndieMaster).filter(IndieMaster.id == booking.indie_master_id).first()
        if indie and isinstance(indie.user_id, int):
            return indie.user_id
        if indie and indie.master_id:
            master = db.query(Master).filter(Master.id == indie.master_id).first()
            if master and isinstance(master.user_id, int):
                return master.user_id
    return None


def _should_notify(recipient_id: Optional[int], actor_user_id: Optional[int]) -> bool:
    if recipient_id is None:
        return False
    if actor_user_id is not None and actor_user_id == recipient_id:
        return False
    return True


def _labels_for(db: Session, booking: Booking, start: Optional[datetime]) -> tuple[str, str]:
    tz = _master_zoneinfo(db, booking.master_id)
    wall = _wall_datetime(start, tz)
    return _date_label(wall), _time_label(wall)


def _body(service_name: str, date_label: str, time_label: str) -> str:
    parts = [part for part in (service_name, date_label, time_label) if part]
    return " · ".join(parts) if parts else service_name or _FALLBACK_SERVICE


def _create_and_fanout(
    db: Session,
    *,
    actor_user_id: Optional[int] = None,
    **kwargs,
) -> tuple[Any, bool]:
    row, created = create_notification(db, **kwargs)
    logger.info(
        "booking_notification type=%s created=%s recipient_user_id=%s actor_user_id=%s entity_id=%s dedup=%s",
        kwargs.get("type"),
        created,
        kwargs.get("user_id"),
        actor_user_id,
        kwargs.get("entity_id"),
        kwargs.get("dedup_key"),
    )
    if created:
        fanout_notification_to_active_devices(db, notification=row)
    return row, created


def record_booking_created_notification(
    db: Session,
    booking: Booking,
    *,
    actor_user_id: Optional[int],
) -> Optional[tuple[Any, bool]]:
    recipient = recipient_user_id(db, booking)
    if not _should_notify(recipient, actor_user_id) or not booking.id:
        return None
    service_name = _service_name(db, booking)
    date_label, time_label = _labels_for(db, booking, booking.start_time)
    data: Mapping[str, Any] = {
        "service_name": service_name,
        "date_label": date_label,
        "time_label": time_label,
    }
    return _create_and_fanout(
        db,
        actor_user_id=actor_user_id,
        user_id=recipient,
        type="booking_created",
        title="Новая запись",
        body=_body(service_name, date_label, time_label),
        entity_type="booking",
        entity_id=booking.id,
        dedup_key=f"booking_created:{booking.id}",
        data=data,
    )


def record_booking_cancelled_notification(
    db: Session,
    booking: Booking,
    *,
    actor_user_id: Optional[int],
    schedule_start: Optional[datetime] = None,
) -> Optional[tuple[Any, bool]]:
    recipient = recipient_user_id(db, booking)
    if not _should_notify(recipient, actor_user_id) or not booking.id:
        return None
    start = schedule_start if schedule_start is not None else booking.start_time
    service_name = _service_name(db, booking)
    date_label, time_label = _labels_for(db, booking, start)
    data: Mapping[str, Any] = {
        "service_name": service_name,
        "date_label": date_label,
        "time_label": time_label,
    }
    return _create_and_fanout(
        db,
        actor_user_id=actor_user_id,
        user_id=recipient,
        type="booking_cancelled",
        title="Запись отменена",
        body=_body(service_name, date_label, time_label),
        entity_type="booking",
        entity_id=booking.id,
        dedup_key=f"booking_cancelled:{booking.id}",
        data=data,
    )


def record_booking_rescheduled_notification(
    db: Session,
    booking: Booking,
    *,
    actor_user_id: Optional[int],
    old_start: Optional[datetime],
    new_start: Optional[datetime] = None,
) -> Optional[tuple[Any, bool]]:
    recipient = recipient_user_id(db, booking)
    if not _should_notify(recipient, actor_user_id) or not booking.id:
        return None
    target = new_start if new_start is not None else booking.start_time
    if same_schedule_instant(old_start, target):
        return None
    service_name = _service_name(db, booking)
    old_date_label, old_time_label = _labels_for(db, booking, old_start)
    new_date_label, new_time_label = _labels_for(db, booking, target)
    data: Mapping[str, Any] = {
        "service_name": service_name,
        "date_label": new_date_label,
        "time_label": new_time_label,
        "old_date_label": old_date_label,
        "old_time_label": old_time_label,
        "new_date_label": new_date_label,
        "new_time_label": new_time_label,
    }
    return _create_and_fanout(
        db,
        actor_user_id=actor_user_id,
        user_id=recipient,
        type="booking_rescheduled",
        title="Запись перенесена",
        body=_body(service_name, new_date_label, new_time_label),
        entity_type="booking",
        entity_id=booking.id,
        dedup_key=(
            f"booking_rescheduled:{booking.id}:{_start_key(old_start)}:{_start_key(target)}"
        ),
        data=data,
    )


def record_booking_mutation_side_effects(
    db: Session,
    booking: Booking,
    *,
    actor_user_id: Optional[int],
    old_start: Optional[datetime],
    old_status: Any,
) -> None:
    """Cancel vs reschedule after an in-place booking update. Same session, no commit."""
    if is_cancel_status(booking.status) and not is_cancel_status(old_status):
        record_booking_cancelled_notification(
            db, booking, actor_user_id=actor_user_id, schedule_start=old_start or booking.start_time
        )
        return
    if not same_schedule_instant(old_start, booking.start_time) and not is_cancel_status(booking.status):
        record_booking_rescheduled_notification(
            db,
            booking,
            actor_user_id=actor_user_id,
            old_start=old_start,
            new_start=booking.start_time,
        )
