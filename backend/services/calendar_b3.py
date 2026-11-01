"""Calendar B3 writes: manual bookings and private blocks.

Occupancy stays in the existing admission engine. This module only reserves
one writer transaction, admits, and stores the row.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import (
    CALENDAR_BLOCK_CATEGORIES,
    Booking,
    BookingStatus,
    CalendarBlock,
    IndieMaster,
    Master,
    MasterClientMetadata,
    MasterService,
    Service,
    master_services,
)
from services.booking_admission import (
    admit_booking_request,
    admit_booking_update,
    admit_calendar_block,
    manual_booking_metadata,
    mark_booking_mutated,
    request_interval,
    resolve_admission_owner,
    unified_admission_enabled,
)
from services.calendar_admission import AdmissionBusy, SQLiteAdmissionTransaction
from services.calendar_time import CanonicalInstant, CanonicalInterval, canonical_instant
from services.idempotency_receipts import (
    IdempotencyKeyReused,
    find_receipt,
    record_receipt,
    request_fingerprint,
)
from utils.booking_limit_guard import BOOKING_SLOT_BUSY_CODE, BOOKING_SLOT_BUSY_MESSAGE

MANUAL_SCOPE = "master_manual_booking"
BLOCK_SCOPE = "master_calendar_block"
UNIFIED_REQUIRED_CODE = "CALENDAR_UNIFIED_REQUIRED"
VERSION_CONFLICT_CODE = "CALENDAR_VERSION_CONFLICT"
MANUAL_MIN_US = 10 * 60 * 1_000_000
MANUAL_MAX_US = 12 * 60 * 60 * 1_000_000
BLOCK_MIN_US = MANUAL_MIN_US
BLOCK_MAX_US = 62 * 24 * 60 * 60 * 1_000_000
_PHONE_RE = re.compile(r"^\+?[0-9]{10,15}$")


SERVICE_IN_USE = "Услугу нельзя удалить: на неё ссылаются записи. Историческая услуга сохранена."


@dataclass(frozen=True)
class ManualWrite:
    client_name: str
    start_time: datetime
    end_time: datetime
    client_phone: Optional[str] = None
    service_id: Optional[int] = None
    master_service_id: Optional[int] = None
    notes: Optional[str] = None
    version: Optional[int] = None
    service_id_set: bool = False
    master_service_id_set: bool = False


@dataclass(frozen=True)
class BlockWrite:
    start_time: datetime
    end_time: datetime
    category: str = "personal"
    title: Optional[str] = None
    description: Optional[str] = None
    version: Optional[int] = None


def require_unified_writes() -> None:
    if not unified_admission_enabled():
        raise _error(
            503,
            UNIFIED_REQUIRED_CODE,
            "Запись календаря доступна только в режиме unified.",
        )


def create_manual_booking(
    db: Session, master: Master, actor_user_id: int, body: ManualWrite, idempotency_key: Optional[str]
) -> dict:
    require_unified_writes()
    fingerprint = _fingerprint("manual", body)
    try:
        with SQLiteAdmissionTransaction(db):
            replay = _replay(db, actor_user_id, MANUAL_SCOPE, idempotency_key, fingerprint)
            if replay is not None:
                return _manual_payload(db, replay)
            booking = _insert_manual(db, master, actor_user_id, body)
            if idempotency_key:
                record_receipt(
                    db,
                    actor_user_id=actor_user_id,
                    scope=MANUAL_SCOPE,
                    raw_key=idempotency_key,
                    fingerprint=fingerprint,
                    resource_type="booking",
                    resource_id=booking.id,
                )
            return _manual_payload(db, booking.id)
    except Exception as exc:
        return _translate(db, exc, actor_user_id, MANUAL_SCOPE, idempotency_key, fingerprint, _manual_payload)


def update_manual_booking(db: Session, master: Master, booking_id: int, body: ManualWrite) -> dict:
    require_unified_writes()
    try:
        with SQLiteAdmissionTransaction(db):
            booking = _owned_manual(db, master.id, booking_id, editable=True)
            _require_version(booking.version, body.version)
            _apply_manual_update(db, master, booking, body)
            return _manual_payload(db, booking.id)
    except Exception as exc:
        return _translate(db, exc, master.user_id, MANUAL_SCOPE, None, "", _manual_payload)


def delete_manual_booking(db: Session, master: Master, booking_id: int, version: int) -> dict:
    require_unified_writes()
    try:
        with SQLiteAdmissionTransaction(db):
            booking = _owned_manual(db, master.id, booking_id)
            _require_version(booking.version, version)
            booking.status = BookingStatus.CANCELLED.value
            booking.cancelled_by_user_id = master.user_id
            booking.version = int(booking.version or 1) + 1
            return _manual_payload(db, booking.id)
    except Exception as exc:
        return _translate(db, exc, master.user_id, MANUAL_SCOPE, None, "", _manual_payload)


def create_calendar_block(
    db: Session, master: Master, actor_user_id: int, body: BlockWrite, idempotency_key: Optional[str]
) -> dict:
    require_unified_writes()
    fingerprint = _fingerprint("block", body)
    try:
        with SQLiteAdmissionTransaction(db):
            replay = _replay(db, actor_user_id, BLOCK_SCOPE, idempotency_key, fingerprint)
            if replay is not None:
                return _block_payload(db, replay)
            block = _insert_block(db, master, actor_user_id, body)
            if idempotency_key:
                record_receipt(
                    db,
                    actor_user_id=actor_user_id,
                    scope=BLOCK_SCOPE,
                    raw_key=idempotency_key,
                    fingerprint=fingerprint,
                    resource_type="calendar_block",
                    resource_id=block.id,
                )
            return _block_payload(db, block.id)
    except Exception as exc:
        return _translate(db, exc, actor_user_id, BLOCK_SCOPE, idempotency_key, fingerprint, _block_payload)


def update_calendar_block(db: Session, master: Master, block_id: int, body: BlockWrite) -> dict:
    require_unified_writes()
    try:
        with SQLiteAdmissionTransaction(db):
            block = _owned_block(db, master.id, block_id)
            _require_version(block.version, body.version)
            _apply_block_update(db, master, block, body)
            return _block_payload(db, block.id)
    except Exception as exc:
        return _translate(db, exc, master.user_id, BLOCK_SCOPE, None, "", _block_payload)


def delete_calendar_block(db: Session, master: Master, block_id: int, version: int) -> dict:
    require_unified_writes()
    try:
        with SQLiteAdmissionTransaction(db):
            block = _owned_block(db, master.id, block_id)
            _require_version(block.version, version)
            block.deleted_at = datetime.utcnow()
            block.version = int(block.version or 1) + 1
            return _block_payload(db, block.id)
    except Exception as exc:
        return _translate(db, exc, master.user_id, BLOCK_SCOPE, None, "", _block_payload)


def list_owned_services(db: Session, master: Master) -> list[dict]:
    """Services a master can attach to a manual booking.

    service_id is Service.id. master_service_id is MasterService.id.
    A row never carries both, and the two sequences are not substituted.
    """
    listed = [
        {
            "service_id": row.id,
            "master_service_id": None,
            "name": row.name,
            "duration": row.duration,
            "price": row.price,
        }
        for row in _canonical_services(db, master)
    ]
    catalog = (
        db.query(MasterService)
        .filter(MasterService.master_id == master.id)
        .order_by(MasterService.name, MasterService.id)
        .all()
    )
    listed.extend(
        {
            "service_id": None,
            "master_service_id": row.id,
            "name": row.name,
            "duration": row.duration,
            "price": row.price,
        }
        for row in catalog
    )
    return listed


def _canonical_services(db: Session, master: Master) -> list:
    linked_ids = [
        row.service_id
        for row in db.execute(
            master_services.select().where(master_services.c.master_id == master.id)
        ).all()
    ]
    indie_ids = [
        row.id
        for row in db.query(IndieMaster.id).filter(IndieMaster.master_id == master.id).all()
    ]
    clauses = []
    if linked_ids:
        clauses.append(Service.id.in_(linked_ids))
    if indie_ids:
        clauses.append(Service.indie_master_id.in_(indie_ids))
    if not clauses:
        return []
    return db.query(Service).filter(or_(*clauses)).order_by(Service.name, Service.id).all()


def list_calendar_blocks(db: Session, master: Master) -> list[dict]:
    rows = (
        db.query(CalendarBlock)
        .filter(CalendarBlock.master_id == master.id, CalendarBlock.deleted_at.is_(None))
        .order_by(CalendarBlock.start_utc_us, CalendarBlock.id)
        .all()
    )
    return [_block_dict(row) for row in rows]


def _insert_manual(db: Session, master: Master, actor_user_id: int, body: ManualWrite) -> Booking:
    interval = _admitted_interval(db, master.id, body.start_time, body.end_time, MANUAL_MIN_US, MANUAL_MAX_US)
    service, catalog = _service_choice(db, master, body)
    _duration_matches_service(interval, service or catalog)
    decision = admit_booking_request(db, start=body.start_time, end=body.end_time, master_id=master.id)
    contact = _link_contact(db, master, body.client_phone, body.client_name)
    booking = Booking(
        master_id=master.id,
        client_id=None,
        service_id=service.id if service is not None else None,
        master_service_id=catalog.id if catalog is not None else None,
        indie_master_id=None,
        salon_id=None,
        branch_id=None,
        status=BookingStatus.CONFIRMED.value,
        notes=body.notes,
        guest_name=body.client_name,
        master_client_metadata_id=contact.id if contact is not None else None,
        loyalty_points_used=0,
        payment_amount=None,
        payment_method=None,
        is_paid=False,
        **manual_booking_metadata(decision, actor_user_id),
    )
    db.add(booking)
    db.flush()
    return booking


def _apply_manual_update(db: Session, master: Master, booking: Booking, body: ManualWrite) -> None:
    interval = _admitted_interval(
        db, master.id, body.start_time, body.end_time, MANUAL_MIN_US, MANUAL_MAX_US, exclude_booking_id=booking.id
    )
    service_id, master_service_id = _service_update(db, master, booking, body)
    _duration_matches_service(interval, _duration_source(db, master, service_id, master_service_id))
    decision = admit_booking_update(
        db,
        booking,
        {"start_time": body.start_time, "end_time": body.end_time},
    )
    contact = _link_contact(db, master, body.client_phone, body.client_name)
    booking.guest_name = body.client_name
    booking.notes = body.notes
    booking.service_id = service_id
    booking.master_service_id = master_service_id
    booking.master_client_metadata_id = contact.id if contact is not None else None
    booking.client_id = None
    booking.status = BookingStatus.CONFIRMED.value
    booking.source = "manual"
    if decision is not None:
        mark_booking_mutated(booking, decision)
    else:
        booking.version = int(booking.version or 1) + 1


def _insert_block(db: Session, master: Master, actor_user_id: int, body: BlockWrite) -> CalendarBlock:
    _validate_category(body.category)
    interval = _admitted_interval(db, master.id, body.start_time, body.end_time, BLOCK_MIN_US, BLOCK_MAX_US)
    decision = admit_calendar_block(db, master_id=master.id, interval=interval)
    columns = decision.time_columns()
    block = CalendarBlock(
        master_id=master.id,
        created_by_user_id=actor_user_id,
        category=body.category,
        title=body.title,
        description=body.description,
        start_utc_us=columns["start_utc_us"],
        end_utc_us=columns["end_utc_us"],
        time_zone=columns["time_zone"],
    )
    db.add(block)
    db.flush()
    return block


def _apply_block_update(db: Session, master: Master, block: CalendarBlock, body: BlockWrite) -> None:
    _validate_category(body.category)
    interval = _admitted_interval(
        db,
        master.id,
        body.start_time,
        body.end_time,
        BLOCK_MIN_US,
        BLOCK_MAX_US,
        exclude_block_id=block.id,
    )
    decision = admit_calendar_block(db, master_id=master.id, interval=interval, exclude_block_id=block.id)
    columns = decision.time_columns()
    block.category = body.category
    block.title = body.title
    block.description = body.description
    block.start_utc_us = columns["start_utc_us"]
    block.end_utc_us = columns["end_utc_us"]
    block.time_zone = columns["time_zone"]
    block.version = int(block.version or 1) + 1


def _admitted_interval(
    db: Session,
    master_id: int,
    start: datetime,
    end: datetime,
    minimum: int,
    maximum: int,
    exclude_booking_id: Optional[int] = None,
    exclude_block_id: Optional[int] = None,
) -> CanonicalInterval:
    del exclude_booking_id, exclude_block_id
    owner = resolve_admission_owner(db, master_id=master_id)
    interval = request_interval(start, end, owner.time_zone)
    now = canonical_instant(datetime.now(timezone.utc))
    if interval.end <= now:
        raise _error(400, "BOOKING_TIME_INVALID", "Нельзя занять интервал, который уже закончился.")
    if interval.duration_microseconds < minimum or interval.duration_microseconds > maximum:
        raise _error(400, "BOOKING_TIME_INVALID", "Длительность интервала вне допустимых границ.")
    return interval


def _duration_matches_service(interval: CanonicalInterval, service) -> None:
    duration = getattr(service, "duration", None) if service is not None else None
    if not duration:
        return
    minutes = interval.duration_microseconds / 60_000_000
    if abs(minutes - float(duration)) > 1:
        raise _error(400, "BOOKING_TIME_INVALID", "Продолжительность услуги не соответствует времени записи")


def _service_choice(db: Session, master: Master, body: ManualWrite):
    if body.service_id is not None and body.master_service_id is not None:
        raise HTTPException(status_code=400, detail="Укажите service_id или master_service_id, но не оба.")
    if body.master_service_id is not None:
        catalog = (
            db.query(MasterService)
            .filter(MasterService.id == body.master_service_id, MasterService.master_id == master.id)
            .first()
        )
        if catalog is None:
            raise HTTPException(status_code=404, detail="Услуга не найдена")
        return None, catalog
    return _owned_service(db, master, body.service_id), None


def _service_update(db: Session, master: Master, booking: Booking, body: ManualWrite):
    """Resolve the service link for PUT.

    Omitted fields keep the stored identity. An explicit null is a clear.
    A new id replaces the other side. Both ids together stay invalid.
    """
    sent_service = body.service_id_set
    sent_catalog = body.master_service_id_set
    if not sent_service and not sent_catalog:
        return booking.service_id, booking.master_service_id
    if body.service_id is not None and body.master_service_id is not None:
        raise HTTPException(status_code=400, detail="Укажите service_id или master_service_id, но не оба.")
    if body.master_service_id is not None:
        _, catalog = _service_choice(db, master, body)
        return None, catalog.id
    if body.service_id is not None:
        service, _ = _service_choice(db, master, body)
        return service.id, None
    if sent_service and sent_catalog:
        return None, None
    if sent_service:
        return None, booking.master_service_id
    return booking.service_id, None


def _duration_source(db: Session, master: Master, service_id: Optional[int], master_service_id: Optional[int]):
    if master_service_id is not None:
        return (
            db.query(MasterService)
            .filter(MasterService.id == master_service_id, MasterService.master_id == master.id)
            .first()
        )
    if service_id is not None:
        return db.query(Service).filter(Service.id == service_id).first()
    return None


def booking_service_snapshot(db: Session, master_id: int, booking: Booking) -> dict:
    """Owned service facts. A MasterService id is never read as Service.id."""
    snapshot = {
        "service_id": booking.service_id,
        "master_service_id": booking.master_service_id,
        "name": None,
        "duration": None,
        "price": None,
        "known": False,
    }
    if booking.service_id:
        service = getattr(booking, "service", None)
        if service is None or getattr(service, "id", None) != booking.service_id:
            service = db.query(Service).filter(Service.id == booking.service_id).first()
        if service is not None:
            snapshot.update(name=service.name, duration=service.duration, price=service.price, known=True)
        return snapshot
    if booking.master_service_id:
        catalog = (
            db.query(MasterService)
            .filter(
                MasterService.id == booking.master_service_id,
                MasterService.master_id == master_id,
            )
            .first()
        )
        if catalog is not None:
            snapshot.update(name=catalog.name, duration=catalog.duration, price=catalog.price, known=True)
        return snapshot
    return snapshot


def run_service_writer(db: Session, operation) -> None:
    """Check and delete in one writer transaction.

    SQLite BEGIN IMMEDIATE serializes this with manual-booking creation.
    The reference check does not depend on PRAGMA foreign_keys.
    """
    if db.get_bind().dialect.name == "sqlite":
        try:
            with SQLiteAdmissionTransaction(db):
                operation(db)
        except AdmissionBusy as exc:
            raise HTTPException(status_code=503, detail="База занята, повторите удаление услуги.") from exc
        return
    operation(db)
    db.commit()


def delete_owned_master_service(db: Session, master_id: int, service_id: int) -> None:
    def operation(session: Session) -> None:
        query = session.query(MasterService).filter(
            MasterService.id == service_id,
            MasterService.master_id == master_id,
        )
        if session.get_bind().dialect.name != "sqlite":
            query = query.with_for_update()
        row = query.first()
        if row is None:
            raise HTTPException(status_code=404, detail="Услуга не найдена")
        referenced = session.query(Booking.id).filter(Booking.master_service_id == row.id).first()
        if referenced is not None:
            raise HTTPException(status_code=409, detail=SERVICE_IN_USE)
        session.delete(row)

    run_service_writer(db, operation)


def delete_canonical_service(db: Session, service_id: int, *, salon_id: Optional[int] = None) -> None:
    def operation(session: Session) -> None:
        query = session.query(Service).filter(Service.id == service_id)
        if salon_id is not None:
            query = query.filter(Service.salon_id == salon_id)
        if session.get_bind().dialect.name != "sqlite":
            query = query.with_for_update()
        row = query.first()
        if row is None:
            raise HTTPException(status_code=404, detail="Service not found")
        referenced = session.query(Booking.id).filter(Booking.service_id == row.id).first()
        if referenced is not None:
            raise HTTPException(status_code=409, detail=SERVICE_IN_USE)
        session.delete(row)

    run_service_writer(db, operation)


def _owned_service(db: Session, master: Master, service_id: Optional[int]) -> Optional[Service]:
    if service_id is None:
        return None
    service = db.query(Service).filter(Service.id == service_id).first()
    if service is None or not _service_owned(db, master, service):
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    return service


def _service_owned(db: Session, master: Master, service: Service) -> bool:
    linked = db.execute(
        master_services.select().where(
            master_services.c.master_id == master.id,
            master_services.c.service_id == service.id,
        )
    ).first()
    if linked is not None:
        return True
    if service.indie_master_id is None:
        return False
    return (
        db.query(IndieMaster.id)
        .filter(IndieMaster.id == service.indie_master_id, IndieMaster.master_id == master.id)
        .first()
        is not None
    )


def _link_contact(db: Session, master: Master, phone: Optional[str], client_name: str) -> Optional[MasterClientMetadata]:
    if phone is None:
        return None
    if _PHONE_RE.fullmatch(phone) is None:
        raise HTTPException(status_code=400, detail="Некорректный телефон клиента.")
    digits = re.sub(r"\D", "", phone)
    rows = (
        db.query(MasterClientMetadata)
        .filter(MasterClientMetadata.master_id == master.id)
        .all()
    )
    for row in rows:
        if row.client_phone == phone or re.sub(r"\D", "", row.client_phone or "") == digits:
            return row
    contact = MasterClientMetadata(master_id=master.id, client_phone=phone, alias_name=client_name)
    db.add(contact)
    db.flush()
    return contact


def _validate_category(category: str) -> None:
    if category not in CALENDAR_BLOCK_CATEGORIES:
        raise HTTPException(status_code=400, detail="Недопустимая категория блока.")


def _owned_manual(db: Session, master_id: int, booking_id: int, *, editable: bool = False) -> Booking:
    filters = [
        Booking.id == booking_id,
        Booking.master_id == master_id,
        Booking.source == "manual",
        Booking.status != BookingStatus.CANCELLED.value,
    ]
    if editable:
        filters.append(Booking.status != BookingStatus.COMPLETED.value)
    booking = (
        db.query(Booking)
        .filter(*filters)
        .first()
    )
    if booking is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return booking


def _owned_block(db: Session, master_id: int, block_id: int) -> CalendarBlock:
    block = (
        db.query(CalendarBlock)
        .filter(
            CalendarBlock.id == block_id,
            CalendarBlock.master_id == master_id,
            CalendarBlock.deleted_at.is_(None),
        )
        .first()
    )
    if block is None:
        raise HTTPException(status_code=404, detail="Блок не найден")
    return block


def _require_version(current: Optional[int], expected: Optional[int]) -> None:
    if expected is None or int(current or 1) != int(expected):
        raise _error(409, VERSION_CONFLICT_CODE, "Запись уже изменена. Обновите календарь и повторите.")


def _replay(db: Session, actor_user_id: int, scope: str, key: Optional[str], fingerprint: str) -> Optional[int]:
    if not key:
        return None
    receipt = find_receipt(db, actor_user_id=actor_user_id, scope=scope, raw_key=key, fingerprint=fingerprint)
    if receipt is None:
        return None
    return receipt.resource_id


def _translate(db, exc, actor_user_id, scope, key, fingerprint, loader):
    if isinstance(exc, HTTPException):
        raise exc
    if isinstance(exc, AdmissionBusy):
        raise _error(503, BOOKING_SLOT_BUSY_CODE, BOOKING_SLOT_BUSY_MESSAGE, retry_after="1") from exc
    if isinstance(exc, IdempotencyKeyReused):
        raise _error(409, "IDEMPOTENCY_KEY_REUSED", "Ключ идемпотентности уже использован для другого запроса.") from exc
    if isinstance(exc, IntegrityError) and key:
        db.rollback()
        try:
            found = find_receipt(db, actor_user_id=actor_user_id, scope=scope, raw_key=key, fingerprint=fingerprint)
        except IdempotencyKeyReused as reused:
            raise _error(409, "IDEMPOTENCY_KEY_REUSED", "Ключ идемпотентности уже использован для другого запроса.") from reused
        if found is not None:
            return loader(db, found.resource_id)
    raise exc


def _fingerprint(kind: str, body) -> str:
    payload = {"kind": kind, **body.__dict__}
    for key, value in list(payload.items()):
        if isinstance(value, datetime):
            payload[key] = value.isoformat()
    return request_fingerprint(payload)


def _manual_payload(db: Session, booking_id: int) -> dict:
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    contact = None
    if booking is not None and booking.master_client_metadata_id is not None:
        contact = (
            db.query(MasterClientMetadata)
            .filter(
                MasterClientMetadata.id == booking.master_client_metadata_id,
                MasterClientMetadata.master_id == booking.master_id,
            )
            .first()
        )
    return {
        "id": booking.id,
        "public_reference": booking.public_reference,
        "client_id": None,
        "client_name": booking.guest_name,
        "client_phone": contact.client_phone if contact is not None else None,
        "service_id": booking.service_id,
        "master_service_id": booking.master_service_id,
        "master_id": booking.master_id,
        "start_time": _iso(booking.start_time),
        "end_time": _iso(booking.end_time),
        "status": _status(booking.status),
        "source": booking.source,
        "notes": booking.notes,
        "version": booking.version,
        "time_zone": booking.time_zone,
        "start_utc_us": booking.start_utc_us,
        "end_utc_us": booking.end_utc_us,
        "payment_amount": booking.payment_amount,
        "loyalty_points_used": int(booking.loyalty_points_used or 0),
    }


def _block_payload(db: Session, block_id: int) -> dict:
    block = db.query(CalendarBlock).filter(CalendarBlock.id == block_id).first()
    return _block_dict(block)


def _block_dict(block: CalendarBlock) -> dict:
    wall_start, wall_end = _block_wall(block)
    return {
        "id": block.id,
        "master_id": block.master_id,
        "category": block.category,
        "title": block.title,
        "description": block.description,
        "start_time": _iso(wall_start),
        "end_time": _iso(wall_end),
        "time_zone": block.time_zone,
        "start_utc_us": block.start_utc_us,
        "end_utc_us": block.end_utc_us,
        "version": block.version,
        "deleted_at": _iso(block.deleted_at),
    }


def _block_wall(block: CalendarBlock):
    from services.calendar_adapters import canonical_time_columns

    interval = CanonicalInterval(CanonicalInstant(block.start_utc_us), CanonicalInstant(block.end_utc_us))
    columns = canonical_time_columns(interval, block.time_zone)
    return columns["start_time"], columns["end_time"]


def _status(value) -> str:
    return getattr(value, "value", value)


def _iso(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat()


def _error(status_code: int, code: str, message: str, retry_after: Optional[str] = None) -> HTTPException:
    headers = {"X-Error-Code": code}
    if retry_after is not None:
        headers["Retry-After"] = retry_after
    return HTTPException(status_code=status_code, detail=message, headers=headers)
