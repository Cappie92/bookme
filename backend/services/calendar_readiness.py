"""Read-only activation readiness for unified booking admission.

Unified admission fails closed on any occupying interval whose instant cannot
be proven. An owner is ready when none of its still-relevant bookings or
pending holds is unresolved. Nothing here writes or infers stored offsets;
the master-zone figures are candidates for an owner-approved resolution only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import or_
from sqlalchemy.orm import Session

from models import Booking, IndieMaster, Master, TemporaryBooking
from services.calendar_adapters import booking_interval, stored_interval
from services.calendar_time import (
    AmbiguousWallTimeError,
    NonexistentWallTimeError,
    TimeNormalizationError,
    resolve_wall_datetime,
)
from utils.booking_occupancy import apply_occupying_filter

# Same bound as admission: a naive wall time is at most 12h behind its UTC digits.
_LEGACY_LATEST_SHIFT = timedelta(hours=12)


@dataclass
class CandidateResolution:
    """How unresolved rows would classify under the master's current zone."""

    resolvable: int = 0
    dst_gap: int = 0
    dst_fold: int = 0


@dataclass
class OwnerReadiness:
    master_id: int
    timezone_valid: bool
    unresolved_bookings: int = 0
    unresolved_holds: int = 0
    candidate: CandidateResolution = field(default_factory=CandidateResolution)

    @property
    def ready(self) -> bool:
        return self.timezone_valid and not self.unresolved_bookings and not self.unresolved_holds


def _zone_name(master: Master) -> Optional[str]:
    name = (master.timezone or "").strip()
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return None
    return name or None


def _classify_candidate(candidate: CandidateResolution, row, zone_name: Optional[str]) -> None:
    if zone_name is None or row.start_time is None or row.end_time is None:
        return
    try:
        for value in (row.start_time, row.end_time):
            resolve_wall_datetime(value.replace(tzinfo=None), zone_name)
    except NonexistentWallTimeError:
        candidate.dst_gap += 1
    except AmbiguousWallTimeError:
        candidate.dst_fold += 1
    except TimeNormalizationError:
        return
    else:
        candidate.resolvable += 1


def _still_relevant(now: datetime):
    return or_(Booking.end_time.is_(None), Booking.end_time > now - _LEGACY_LATEST_SHIFT)


def owner_readiness(db: Session, master: Master, now_utc: Optional[datetime] = None) -> OwnerReadiness:
    now = (now_utc or datetime.utcnow()).replace(tzinfo=None)
    zone_name = _zone_name(master)
    report = OwnerReadiness(master_id=master.id, timezone_valid=zone_name is not None)
    indie_id = db.query(IndieMaster.id).filter(IndieMaster.master_id == master.id).scalar()
    owner = [Booking.master_id == master.id]
    if indie_id is not None:
        owner.append(Booking.indie_master_id == indie_id)
    bookings = apply_occupying_filter(db.query(Booking)).filter(or_(*owner), _still_relevant(now))
    for booking in bookings.all():
        if not booking_interval(booking).is_resolved:
            report.unresolved_bookings += 1
            _classify_candidate(report.candidate, booking, zone_name)

    holds = db.query(TemporaryBooking).filter(
        TemporaryBooking.master_id == master.id,
        TemporaryBooking.status == "pending",
        TemporaryBooking.expires_at > now,
    )
    for hold in holds.all():
        resolved = stored_interval(
            start_utc_us=hold.start_utc_us,
            end_utc_us=hold.end_utc_us,
            time_zone=hold.time_zone,
            start_time=hold.start_time,
            end_time=hold.end_time,
        )
        if not resolved.is_resolved:
            report.unresolved_holds += 1
    return report


@dataclass
class WriteProvenance:
    """Every booking row by the origin of its time metadata.

    A row without canonical columns is a new write when it carries the
    provenance stamped by current writers (``source``) or was created at or
    after ``shadow_since``; otherwise it is history from before shadow writes.
    """

    legacy_history: int = 0
    canonical: int = 0
    canonical_wall_in_master_zone: int = 0
    canonical_wall_in_other_zone: int = 0
    unresolved_new_writes: int = 0
    unresolved_new_writes_still_relevant: int = 0
    conflicting_canonical: int = 0
    conflicting_canonical_still_relevant: int = 0

    def as_dict(self) -> dict:
        return dict(self.__dict__)


_CANONICAL_COLUMNS = ("start_utc_us", "end_utc_us", "time_zone")


def write_provenance(
    db: Session, now_utc: Optional[datetime] = None, shadow_since: Optional[datetime] = None
) -> WriteProvenance:
    now = (now_utc or datetime.utcnow()).replace(tzinfo=None)
    since = shadow_since.replace(tzinfo=None) if shadow_since is not None else None
    master_zones = dict(db.query(Master.id, Master.timezone).all())
    indie_masters = dict(db.query(IndieMaster.id, IndieMaster.master_id).all())
    report = WriteProvenance()
    for booking in db.query(Booking).yield_per(500):
        relevant = booking.end_time is None or booking.end_time > now - _LEGACY_LATEST_SHIFT
        present = [getattr(booking, key) is not None for key in _CANONICAL_COLUMNS]
        if any(present):
            if not booking_interval(booking).is_resolved:
                report.conflicting_canonical += 1
                report.conflicting_canonical_still_relevant += relevant
                continue
            report.canonical += 1
            master_id = booking.master_id or indie_masters.get(booking.indie_master_id)
            if booking.time_zone == master_zones.get(master_id):
                report.canonical_wall_in_master_zone += 1
            else:
                report.canonical_wall_in_other_zone += 1
            continue
        is_new = booking.source is not None or (
            since is not None and booking.created_at is not None and booking.created_at >= since
        )
        if is_new:
            report.unresolved_new_writes += 1
            report.unresolved_new_writes_still_relevant += relevant
        else:
            report.legacy_history += 1
    return report


@dataclass
class ReadinessReport:
    masters_total: int = 0
    masters_ready: int = 0
    unresolved_bookings: int = 0
    unresolved_holds: int = 0
    invalid_timezone_masters: int = 0
    ownerless_bookings: int = 0
    blocked_master_ids: List[int] = field(default_factory=list)
    candidate: CandidateResolution = field(default_factory=CandidateResolution)
    provenance: WriteProvenance = field(default_factory=WriteProvenance)

    @property
    def activation_ready(self) -> bool:
        return self.masters_total == self.masters_ready and not self.ownerless_bookings

    def as_dict(self) -> dict:
        return {
            "activation_ready": self.activation_ready,
            "masters_total": self.masters_total,
            "masters_ready": self.masters_ready,
            "unresolved_bookings": self.unresolved_bookings,
            "unresolved_holds": self.unresolved_holds,
            "invalid_timezone_masters": self.invalid_timezone_masters,
            "ownerless_bookings": self.ownerless_bookings,
            "blocked_master_ids": self.blocked_master_ids,
            "candidate_master_zone": {
                "resolvable": self.candidate.resolvable,
                "dst_gap": self.candidate.dst_gap,
                "dst_fold": self.candidate.dst_fold,
            },
            "write_provenance": self.provenance.as_dict(),
        }


def readiness_report(
    db: Session, now_utc: Optional[datetime] = None, shadow_since: Optional[datetime] = None
) -> ReadinessReport:
    report = ReadinessReport()
    masters = db.query(Master).filter(Master.is_deleted.is_(False)).order_by(Master.id)
    for master in masters.all():
        owner = owner_readiness(db, master, now_utc)
        report.masters_total += 1
        report.unresolved_bookings += owner.unresolved_bookings
        report.unresolved_holds += owner.unresolved_holds
        report.candidate.resolvable += owner.candidate.resolvable
        report.candidate.dst_gap += owner.candidate.dst_gap
        report.candidate.dst_fold += owner.candidate.dst_fold
        if not owner.timezone_valid:
            report.invalid_timezone_masters += 1
        if owner.ready:
            report.masters_ready += 1
        else:
            report.blocked_master_ids.append(master.id)
    now = (now_utc or datetime.utcnow()).replace(tzinfo=None)
    report.ownerless_bookings = (
        apply_occupying_filter(db.query(Booking))
        .filter(
            Booking.master_id.is_(None),
            Booking.indie_master_id.is_(None),
            _still_relevant(now),
        )
        .count()
    )
    report.provenance = write_provenance(db, now, shadow_since)
    return report
