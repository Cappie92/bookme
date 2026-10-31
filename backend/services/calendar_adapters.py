"""Adapters from persisted calendar rows to the Phase A availability core.

Nothing here is wired into production booking routes yet. Rows without
canonical time metadata stay unresolved unless the caller supplies explicit
timezone evidence; no offset is ever inferred from a naive timestamp.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from models import (
    Booking,
    CalendarBlock,
    IndieMaster,
    MasterClientMetadata,
    TemporaryBooking,
)
from services.calendar_availability import (
    OccupancyInput,
    OccupancyKind,
    booking_occupancy,
    hold_occupancy,
)
from services.calendar_time import (
    CanonicalInstant,
    CanonicalInterval,
    LegacyTimeEvidence,
    ResolvedInterval,
    TimeNormalizationError,
    TimeResolution,
    classify_legacy_interval,
    resolve_wall_datetime,
)


class BookingSource(str, Enum):
    """Booking.source for new rows; NULL marks a legacy row of unknown origin."""

    ONLINE = "online"
    MANUAL = "manual"


# The only writer of TemporaryBooking.expires_at uses datetime.utcnow(), so the
# naive value is UTC by construction rather than by assumption.
HOLD_EXPIRES_AT_EVIDENCE = LegacyTimeEvidence("UTC")


def _zone(zone_name: Optional[str]) -> ZoneInfo:
    if not zone_name:
        raise TimeNormalizationError("timezone is required")
    try:
        return ZoneInfo(zone_name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise TimeNormalizationError(f"unknown IANA timezone: {zone_name}") from exc


def _wall(instant: CanonicalInstant, zone: ZoneInfo) -> datetime:
    return instant.to_datetime().astimezone(zone).replace(tzinfo=None)


def canonical_time_columns(interval: CanonicalInterval, zone_name: str) -> dict:
    """Column values for a new row: canonical UTC plus the matching wall time.

    ``start_time``/``end_time`` keep the existing naive master-wall convention so
    current readers stay correct; the canonical columns disambiguate DST folds.
    """

    zone = _zone(zone_name)
    return {
        "start_utc_us": interval.start.epoch_microseconds,
        "end_utc_us": interval.end.epoch_microseconds,
        "time_zone": zone_name,
        "start_time": _wall(interval.start, zone),
        "end_time": _wall(interval.end, zone),
    }


def _unresolved(reason: str) -> ResolvedInterval:
    return ResolvedInterval(TimeResolution.UNRESOLVED, None, reason)


def stored_interval(
    *,
    start_utc_us: Optional[int],
    end_utc_us: Optional[int],
    time_zone: Optional[str],
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    require_wall: bool = True,
    evidence: Optional[LegacyTimeEvidence] = None,
) -> ResolvedInterval:
    """Resolve a persisted interval, failing closed on anything inconsistent."""

    canonical = (start_utc_us, end_utc_us, time_zone)
    if all(value is None for value in canonical):
        if start_time is None or end_time is None:
            return _unresolved("interval has no stored time")
        return classify_legacy_interval(start_time, end_time, evidence=evidence)
    if any(value is None for value in canonical):
        return _unresolved("partial canonical time metadata")
    try:
        zone = _zone(time_zone)
        interval = CanonicalInterval(
            CanonicalInstant(start_utc_us), CanonicalInstant(end_utc_us)
        )
    except TimeNormalizationError as exc:
        return _unresolved(str(exc))
    if require_wall:
        if start_time is None or end_time is None:
            return _unresolved("canonical metadata without stored wall time")
        if (
            _wall(interval.start, zone) != start_time
            or _wall(interval.end, zone) != end_time
        ):
            return _unresolved("canonical metadata disagrees with stored wall time")
    return ResolvedInterval(TimeResolution.CANONICAL, interval)


def booking_interval(
    booking: Booking, *, evidence: Optional[LegacyTimeEvidence] = None
) -> ResolvedInterval:
    return stored_interval(
        start_utc_us=booking.start_utc_us,
        end_utc_us=booking.end_utc_us,
        time_zone=booking.time_zone,
        start_time=booking.start_time,
        end_time=booking.end_time,
        evidence=evidence,
    )


def booking_occupancy_input(
    booking: Booking, *, evidence: Optional[LegacyTimeEvidence] = None
) -> Optional[OccupancyInput]:
    return booking_occupancy(
        status=booking.status,
        interval=booking_interval(booking, evidence=evidence),
        source_id=f"booking:{booking.id}",
    )


def hold_occupancy_input(
    hold: TemporaryBooking,
    *,
    now: CanonicalInstant,
    evidence: Optional[LegacyTimeEvidence] = None,
) -> Optional[OccupancyInput]:
    expires_at = None
    if hold.expires_at is not None:
        expires_at = resolve_wall_datetime(
            hold.expires_at, HOLD_EXPIRES_AT_EVIDENCE.zone_name
        )
    interval = stored_interval(
        start_utc_us=hold.start_utc_us,
        end_utc_us=hold.end_utc_us,
        time_zone=hold.time_zone,
        start_time=hold.start_time,
        end_time=hold.end_time,
        evidence=evidence,
    )
    return hold_occupancy(
        status=hold.status,
        interval=interval,
        expires_at=expires_at,
        now=now,
        source_id=f"hold:{hold.id}",
    )


def calendar_block_occupancy_input(block: CalendarBlock) -> Optional[OccupancyInput]:
    """Only the interval leaves; title, description and category stay private."""

    if block.deleted_at is not None:
        return None
    interval = stored_interval(
        start_utc_us=block.start_utc_us,
        end_utc_us=block.end_utc_us,
        time_zone=block.time_zone,
        require_wall=False,
    )
    return OccupancyInput(interval, f"block:{block.id}", OccupancyKind.BLOCK)


def _booking_owner_master_id(db: Session, booking: Booking) -> Optional[int]:
    if booking.master_id is not None:
        return booking.master_id
    if booking.indie_master_id is not None:
        return (
            db.query(IndieMaster.master_id)
            .filter(IndieMaster.id == booking.indie_master_id)
            .scalar()
        )
    return None


def booking_local_contact(
    db: Session, booking: Booking
) -> Optional[MasterClientMetadata]:
    """The booking's local contact, only if it belongs to the booking's own master."""

    if booking.master_client_metadata_id is None:
        return None
    owner_master_id = _booking_owner_master_id(db, booking)
    if owner_master_id is None:
        return None
    return (
        db.query(MasterClientMetadata)
        .filter(
            MasterClientMetadata.id == booking.master_client_metadata_id,
            MasterClientMetadata.master_id == owner_master_id,
        )
        .first()
    )
