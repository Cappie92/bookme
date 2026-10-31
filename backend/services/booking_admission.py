"""Unified booking admission over bookings, holds and calendar blocks.

``CALENDAR_ADMISSION_MODE`` selects the runtime. Anything other than
``unified`` keeps every route on its previous occupancy predicate. In unified
mode all occupancy writes reserve the SQLite writer first, then admit the
candidate against one canonical occupancy source built from the Phase A core
and the B1 adapters. Rows whose instant cannot be proven fail closed.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, List, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from models import Booking, CalendarBlock, IndieMaster, Master, TemporaryBooking
from services.calendar_adapters import (
    booking_interval,
    booking_occupancy_input,
    calendar_block_occupancy_input,
    canonical_time_columns,
    hold_occupancy_input,
    stored_interval,
)
from services.calendar_admission import (
    AdmissionConflict,
    AdmissionUnresolvedTime,
    _is_sqlite_busy,
    ensure_candidate_available,
    in_admission_transaction,
)
from services.calendar_availability import (
    IntervalInput,
    OccupancyInput,
    evaluate_availability,
)
from services.calendar_time import (
    CanonicalInstant,
    CanonicalInterval,
    ResolvedInterval,
    TimeNormalizationError,
    TimeResolution,
    canonical_instant,
    resolve_wall_datetime,
)
from utils.booking_occupancy import apply_occupying_filter, booking_slot_conflict


ADMISSION_MODE_ENV = "CALENDAR_ADMISSION_MODE"
ADMISSION_MODE_LEGACY = "legacy"
ADMISSION_MODE_UNIFIED = "unified"

BOOKING_TIME_UNRESOLVED_CODE = "BOOKING_TIME_UNRESOLVED"
BOOKING_TIME_UNRESOLVED_MESSAGE = (
    "Не удалось однозначно проверить занятость времени. Запись временно недоступна."
)
BOOKING_TIME_INVALID_CODE = "BOOKING_TIME_INVALID"
MASTER_TIMEZONE_REQUIRED_CODE = "MASTER_TIMEZONE_REQUIRED"
BOOKING_OWNER_UNRESOLVED_CODE = "BOOKING_OWNER_UNRESOLVED"

# A naive wall time in an unknown zone is some instant within these bounds of
# the same digits read as UTC (zones span UTC-12..UTC+14). Rows outside the
# widened window provably cannot overlap and need no zone evidence.
_LEGACY_EARLIEST_SHIFT = timedelta(hours=14)
_LEGACY_LATEST_SHIFT = timedelta(hours=12)


def admission_mode() -> str:
    raw = (os.getenv(ADMISSION_MODE_ENV) or "").strip().lower()
    return ADMISSION_MODE_UNIFIED if raw == ADMISSION_MODE_UNIFIED else ADMISSION_MODE_LEGACY


def unified_admission_enabled() -> bool:
    return admission_mode() == ADMISSION_MODE_UNIFIED


def _http_error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code, detail=message, headers={"X-Error-Code": code}
    )


def booking_time_unresolved() -> HTTPException:
    return _http_error(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        BOOKING_TIME_UNRESOLVED_CODE,
        BOOKING_TIME_UNRESOLVED_MESSAGE,
    )


EDIT_REQUEST_TIME_UNRESOLVED_CODE = "EDIT_REQUEST_TIME_UNRESOLVED"


def edit_request_time_unresolved() -> HTTPException:
    """A proposal stored without its instant cannot be applied as a unified move."""

    return _http_error(
        status.HTTP_409_CONFLICT,
        EDIT_REQUEST_TIME_UNRESOLVED_CODE,
        "Предложенное время сохранено без часового пояса. Создайте новый запрос на перенос.",
    )


def _busy() -> HTTPException:
    from utils.booking_limit_guard import BOOKING_SLOT_BUSY_CODE, BOOKING_SLOT_BUSY_MESSAGE

    error = _http_error(503, BOOKING_SLOT_BUSY_CODE, BOOKING_SLOT_BUSY_MESSAGE)
    error.headers["Retry-After"] = "1"
    return error


@dataclass(frozen=True)
class AdmissionOwner:
    master_id: int
    indie_master_id: Optional[int]
    time_zone: str

    @property
    def zone(self) -> ZoneInfo:
        return ZoneInfo(self.time_zone)


def resolve_admission_owner(
    db: Session,
    *,
    master_id: Optional[int] = None,
    indie_master_id: Optional[int] = None,
) -> AdmissionOwner:
    """The master whose time is occupied; indie rows map to the same person."""

    master = None
    if master_id is not None:
        master = db.query(Master).filter(Master.id == master_id).first()
    elif indie_master_id is not None:
        indie = db.query(IndieMaster).filter(IndieMaster.id == indie_master_id).first()
        if indie is not None and indie.master_id is not None:
            master = db.query(Master).filter(Master.id == indie.master_id).first()
    if master is None:
        raise _http_error(400, BOOKING_OWNER_UNRESOLVED_CODE, "Не удалось определить мастера записи")
    zone_name = (master.timezone or "").strip()
    try:
        ZoneInfo(zone_name)
    except (ZoneInfoNotFoundError, ValueError):
        zone_name = ""
    if not zone_name:
        raise _http_error(
            400,
            MASTER_TIMEZONE_REQUIRED_CODE,
            "Мастер не настроил часовой пояс. Запись невозможна.",
        )
    indie_id = (
        db.query(IndieMaster.id).filter(IndieMaster.master_id == master.id).scalar()
    )
    return AdmissionOwner(master.id, indie_id, zone_name)


def request_interval(start: datetime, end: datetime, zone_name: str) -> CanonicalInterval:
    """Interpret a request interval under the scheduling contract.

    Aware values are absolute. Naive values are wall time in the master's zone
    (the same contract as working-hours checks and notifications); DST gaps and
    ambiguous folds are rejected instead of being guessed.
    """

    try:
        instants = [
            canonical_instant(value) if value.tzinfo is not None
            else resolve_wall_datetime(value, zone_name)
            for value in (start, end)
        ]
        return CanonicalInterval(*instants)
    except TimeNormalizationError as exc:
        raise _http_error(400, BOOKING_TIME_INVALID_CODE, f"Некорректное время записи: {exc}") from exc


def _naive_utc(instant: CanonicalInstant) -> datetime:
    return instant.to_datetime().replace(tzinfo=None)


def _legacy_window(window: CanonicalInterval) -> Tuple[datetime, datetime]:
    return (
        _naive_utc(window.start) - _LEGACY_LATEST_SHIFT,
        _naive_utc(window.end) + _LEGACY_EARLIEST_SHIFT,
    )


def _range_filter(model, window: CanonicalInterval):
    """Rows that may overlap the window. Rows missing a bound are kept so they
    surface as unresolved instead of being silently ignored."""
    low, high = _legacy_window(window)
    return or_(
        and_(
            model.start_utc_us < window.end.epoch_microseconds,
            model.end_utc_us > window.start.epoch_microseconds,
        ),
        and_(model.start_time < high, model.end_time > low),
        and_(model.start_time.is_(None), or_(model.end_time.is_(None), model.end_time > low)),
        and_(model.end_time.is_(None), model.start_time < high),
    )


def _owner_bookings_filter(owner: AdmissionOwner):
    conditions = [Booking.master_id == owner.master_id]
    if owner.indie_master_id is not None:
        conditions.append(Booking.indie_master_id == owner.indie_master_id)
    return or_(*conditions)


@dataclass(frozen=True)
class OwnerOccupancy:
    bookings: Tuple[OccupancyInput, ...]
    holds: Tuple[OccupancyInput, ...]
    blocks: Tuple[OccupancyInput, ...]

    @property
    def all(self) -> Tuple[OccupancyInput, ...]:
        return (*self.bookings, *self.holds, *self.blocks)


def load_owner_occupancy(
    db: Session,
    owner: AdmissionOwner,
    window: CanonicalInterval,
    *,
    now: CanonicalInstant,
    exclude_booking_id: Optional[int] = None,
    exclude_hold_id: Optional[int] = None,
    exclude_block_id: Optional[int] = None,
) -> OwnerOccupancy:
    booking_query = apply_occupying_filter(db.query(Booking)).filter(
        _owner_bookings_filter(owner), _range_filter(Booking, window)
    )
    if exclude_booking_id is not None:
        booking_query = booking_query.filter(Booking.id != exclude_booking_id)

    hold_query = db.query(TemporaryBooking).filter(
        TemporaryBooking.master_id == owner.master_id,
        TemporaryBooking.status == "pending",
        _range_filter(TemporaryBooking, window),
    )
    if exclude_hold_id is not None:
        hold_query = hold_query.filter(TemporaryBooking.id != exclude_hold_id)

    block_query = db.query(CalendarBlock).filter(
        CalendarBlock.master_id == owner.master_id,
        CalendarBlock.deleted_at.is_(None),
        CalendarBlock.start_utc_us < window.end.epoch_microseconds,
        CalendarBlock.end_utc_us > window.start.epoch_microseconds,
    )
    if exclude_block_id is not None:
        block_query = block_query.filter(CalendarBlock.id != exclude_block_id)

    def present(items: Iterable[Optional[OccupancyInput]]) -> Tuple[OccupancyInput, ...]:
        return tuple(item for item in items if item is not None)

    return OwnerOccupancy(
        bookings=present(booking_occupancy_input(row) for row in booking_query.all()),
        holds=present(hold_occupancy_input(row, now=now) for row in hold_query.all()),
        blocks=present(calendar_block_occupancy_input(row) for row in block_query.all()),
    )


def reserve_booking_writer(db: Session) -> None:
    """Writer reservation for occupancy mutations that do not insert a Booking.

    Must run before the route reads the rows its decision depends on.
    """
    from utils.booking_limit_guard import begin_booking_creation_transaction

    begin_booking_creation_transaction(db)


def _writer_reserved(db: Session) -> bool:
    from utils.booking_limit_guard import holds_booking_writer_reservation

    return holds_booking_writer_reservation(db) or in_admission_transaction(db)


def _lock_owner(db: Session, owner: AdmissionOwner) -> None:
    if db.get_bind().dialect.name == "sqlite":
        if not _writer_reserved(db):
            # A helper committed mid-route (e.g. automatic client restrictions).
            # Re-reserve before the deciding reads; the guard refuses if the
            # session already holds unflushed route mutations.
            reserve_booking_writer(db)
        return
    db.query(Master.id).filter(Master.id == owner.master_id).with_for_update().first()


def _now() -> CanonicalInstant:
    return canonical_instant(datetime.now(timezone.utc))


@dataclass(frozen=True)
class AdmissionDecision:
    owner: AdmissionOwner
    interval: CanonicalInterval

    def time_columns(self) -> dict:
        """Canonical UTC metadata plus master-wall start/end for existing readers."""

        return canonical_time_columns(self.interval, self.owner.time_zone)


def admit_interval(
    db: Session,
    owner: AdmissionOwner,
    interval: CanonicalInterval,
    *,
    now: Optional[CanonicalInstant] = None,
    exclude_booking_id: Optional[int] = None,
    exclude_hold_id: Optional[int] = None,
    exclude_block_id: Optional[int] = None,
    require_reservation: bool = True,
) -> AdmissionDecision:
    """Reject the candidate unless the owner's whole occupancy is provably free.

    409 is reserved for a proven overlap; unresolved occupancy and a busy
    writer are reported separately and never disguised as a conflict.
    """

    try:
        if require_reservation:
            _lock_owner(db, owner)
        occupancy = load_owner_occupancy(
            db,
            owner,
            interval,
            now=now or _now(),
            exclude_booking_id=exclude_booking_id,
            exclude_hold_id=exclude_hold_id,
            exclude_block_id=exclude_block_id,
        )
    except OperationalError as exc:
        if _is_sqlite_busy(exc):
            raise _busy() from exc
        raise
    result = evaluate_availability(
        working_windows=[IntervalInput(ResolvedInterval(TimeResolution.CANONICAL, interval))],
        grid_starts=[interval.start],
        duration_microseconds=interval.duration_microseconds,
        bookings=occupancy.bookings,
        holds=occupancy.holds,
        blocks=occupancy.blocks,
    )
    try:
        ensure_candidate_available(result, interval)
    except AdmissionConflict as exc:
        raise booking_slot_conflict() from exc
    except AdmissionUnresolvedTime as exc:
        raise booking_time_unresolved() from exc
    return AdmissionDecision(owner, interval)


def admit_booking_request(
    db: Session,
    *,
    start: datetime,
    end: datetime,
    master_id: Optional[int] = None,
    indie_master_id: Optional[int] = None,
    exclude_booking_id: Optional[int] = None,
    exclude_hold_id: Optional[int] = None,
    require_reservation: bool = True,
) -> AdmissionDecision:
    owner = resolve_admission_owner(db, master_id=master_id, indie_master_id=indie_master_id)
    return admit_interval(
        db,
        owner,
        request_interval(start, end, owner.time_zone),
        exclude_booking_id=exclude_booking_id,
        exclude_hold_id=exclude_hold_id,
        require_reservation=require_reservation,
    )


def _occupies(status_value) -> bool:
    from utils.booking_occupancy import NON_OCCUPYING_BOOKING_STATUSES

    return getattr(status_value, "value", status_value) not in NON_OCCUPYING_BOOKING_STATUSES


def admit_booking_update(
    db: Session, booking: Booking, changes: dict
) -> Optional[AdmissionDecision]:
    """Admit an update that moves a booking or makes it occupy time again.

    Plain status transitions between occupying states (e.g. confirmation) are
    not re-admitted, so legacy rows keep working until they are moved.
    """

    new_status = changes.get("status", booking.status)
    time_changed = any(
        key in changes and changes[key] != getattr(booking, key)
        for key in ("start_time", "end_time")
    )
    if not _occupies(new_status):
        return _untracked_move(db, booking, changes) if time_changed else None
    owner_changed = any(
        key in changes and changes[key] != getattr(booking, key)
        for key in ("master_id", "indie_master_id")
    )
    reactivated = not _occupies(booking.status)
    if not (time_changed or owner_changed or reactivated):
        return None

    master_id = changes.get("master_id", booking.master_id)
    owner = resolve_admission_owner(
        db,
        master_id=master_id,
        indie_master_id=None if master_id else changes.get("indie_master_id", booking.indie_master_id),
    )
    if time_changed:
        start, end = changes.get("start_time"), changes.get("end_time")
        if start is None or end is None:
            raise _http_error(
                400,
                BOOKING_TIME_INVALID_CODE,
                "Для переноса нужно передать время начала и окончания",
            )
        interval = request_interval(start, end, owner.time_zone)
    else:
        resolved = booking_interval(booking)
        if _provably_ended(booking, resolved):
            # Past occupancy cannot collide with anything still admissible.
            return None
        if not resolved.is_resolved:
            raise booking_time_unresolved()
        interval = resolved.interval
    return admit_interval(db, owner, interval, exclude_booking_id=booking.id)


def _untracked_move(db: Session, booking: Booking, changes: dict) -> Optional[AdmissionDecision]:
    """Canonical columns for moving a booking that does not occupy time.

    No admission is needed; on any doubt the caller clears the canonical
    columns so the row fails closed if it is ever reactivated.
    """
    master_id = changes.get("master_id", booking.master_id)
    start, end = changes.get("start_time"), changes.get("end_time")
    if start is None or end is None:
        return None
    try:
        owner = resolve_admission_owner(
            db,
            master_id=master_id,
            indie_master_id=None if master_id else changes.get("indie_master_id", booking.indie_master_id),
        )
        return AdmissionDecision(owner, request_interval(start, end, owner.time_zone))
    except HTTPException:
        return None


def _provably_ended(booking: Booking, resolved: ResolvedInterval) -> bool:
    now = _now()
    if resolved.is_resolved:
        return resolved.interval.end <= now
    if booking.end_time is None:
        return False
    return booking.end_time.replace(tzinfo=None) + _LEGACY_LATEST_SHIFT <= _naive_utc(now)


def admit_hold_promotion(db: Session, hold: TemporaryBooking) -> AdmissionDecision:
    """Promote one validated pending hold; only that hold is excluded."""

    owner = resolve_admission_owner(db, master_id=hold.master_id)
    resolved = stored_interval(
        start_utc_us=hold.start_utc_us,
        end_utc_us=hold.end_utc_us,
        time_zone=hold.time_zone,
        start_time=hold.start_time,
        end_time=hold.end_time,
    )
    if not resolved.is_resolved:
        raise booking_time_unresolved()
    return admit_interval(db, owner, resolved.interval, exclude_hold_id=hold.id)


def admit_calendar_block(
    db: Session,
    *,
    master_id: int,
    interval: CanonicalInterval,
    exclude_block_id: Optional[int] = None,
) -> AdmissionDecision:
    """Admission for a CalendarBlock create or move."""

    owner = resolve_admission_owner(db, master_id=master_id)
    return admit_interval(db, owner, interval, exclude_block_id=exclude_block_id)


def expire_pending_holds(db: Session, hold_ids: Sequence[int]) -> int:
    """Expire holds only while still pending, so a concurrent promotion wins."""

    if not hold_ids:
        return 0
    try:
        return (
            db.query(TemporaryBooking)
            .filter(TemporaryBooking.id.in_(list(hold_ids)), TemporaryBooking.status == "pending")
            .update({TemporaryBooking.status: "expired"}, synchronize_session=False)
        )
    except OperationalError as exc:
        if _is_sqlite_busy(exc):
            db.rollback()
            raise _busy() from exc
        raise


def online_booking_metadata(decision: AdmissionDecision, actor_user_id: Optional[int]) -> dict:
    from services.calendar_adapters import BookingSource

    return {
        **decision.time_columns(),
        "source": BookingSource.ONLINE.value,
        "created_by_user_id": actor_user_id,
    }


def manual_booking_metadata(decision: AdmissionDecision, actor_user_id: Optional[int]) -> dict:
    """Server-assigned provenance for a master-created booking."""

    from services.calendar_adapters import BookingSource

    return {
        **decision.time_columns(),
        "source": BookingSource.MANUAL.value,
        "created_by_user_id": actor_user_id,
    }


def mark_booking_mutated(booking: Booking, decision: Optional[AdmissionDecision] = None) -> None:
    """Apply canonical time columns and bump the optimistic version.

    Without a decision, canonical columns that no longer match the wall time
    are cleared: a stale instant must never outlive the wall it described.
    """

    if decision is not None:
        for key, value in decision.time_columns().items():
            setattr(booking, key, value)
    elif booking.start_utc_us is not None and not booking_interval(booking).is_resolved:
        booking.start_utc_us = None
        booking.end_utc_us = None
        booking.time_zone = None
    booking.version = (booking.version or 0) + 1


def slot_occupancy_state(db: Session, master_id: int, start: datetime, end: datetime) -> str:
    """Read-only probe for master selection: free, busy, unresolved or unavailable."""

    try:
        owner = resolve_admission_owner(db, master_id=master_id)
        interval = request_interval(start, end, owner.time_zone)
    except HTTPException:
        return "unavailable"
    occupancy = load_owner_occupancy(db, owner, interval, now=_now())
    if any(not item.resolved.is_resolved for item in occupancy.all):
        return "unresolved"
    if any(item.resolved.interval.overlaps(interval) for item in occupancy.all):
        return "busy"
    return "free"


def filter_slots_unified(
    db: Session,
    owner: AdmissionOwner,
    slots: Sequence[dict],
    *,
    exclude_booking_id: Optional[int] = None,
    now: Optional[CanonicalInstant] = None,
) -> List[dict]:
    """Drop candidate slots occupied in the unified source.

    Slots carry naive master-wall ``start_time``/``end_time``. Any unresolved
    occupancy near the requested slots hides all of them (fail closed).
    """

    candidates = []
    for slot in slots:
        try:
            candidates.append((slot, request_interval(slot["start_time"], slot["end_time"], owner.time_zone)))
        except HTTPException:
            continue
    if not candidates:
        return []
    window = CanonicalInterval(
        min(interval.start for _, interval in candidates),
        max(interval.end for _, interval in candidates),
    )
    occupancy = load_owner_occupancy(
        db, owner, window, now=now or _now(), exclude_booking_id=exclude_booking_id
    )
    if any(not item.resolved.is_resolved for item in occupancy.all):
        return []
    occupied = [item.resolved.interval for item in occupancy.all]
    return [
        slot for slot, interval in candidates
        if not any(interval.overlaps(other) for other in occupied)
    ]
