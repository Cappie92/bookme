"""Canonical time primitives for the calendar admission foundation.

The existing database stores naive datetimes.  This module deliberately does not
guess what those values mean.  Callers must either provide aware datetimes or
explicit evidence describing how a naive wall time is to be interpreted.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


UTC = timezone.utc
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
_MICROSECONDS_PER_SECOND = 1_000_000
_MICROSECONDS_PER_DAY = 86_400 * _MICROSECONDS_PER_SECOND


class TimeResolution(str, Enum):
    CANONICAL = "canonical"
    RESOLVED_WITH_EVIDENCE = "resolved_with_evidence"
    UNRESOLVED = "unresolved"


class TimeNormalizationError(ValueError):
    """The supplied time evidence is invalid or internally inconsistent."""


class AmbiguousWallTimeError(TimeNormalizationError):
    """A DST fold has two valid instants and no fold was selected."""


class NonexistentWallTimeError(TimeNormalizationError):
    """A wall time falls inside a DST gap."""


@dataclass(frozen=True, order=True)
class CanonicalInstant:
    """An absolute instant represented as integer microseconds from Unix epoch."""

    epoch_microseconds: int

    def to_datetime(self) -> datetime:
        seconds, microseconds = divmod(
            self.epoch_microseconds, _MICROSECONDS_PER_SECOND
        )
        return datetime.fromtimestamp(seconds, tz=UTC).replace(microsecond=microseconds)


@dataclass(frozen=True)
class CanonicalInterval:
    """A non-empty half-open interval on the canonical UTC timeline."""

    start: CanonicalInstant
    end: CanonicalInstant

    def __post_init__(self) -> None:
        if self.start >= self.end:
            raise TimeNormalizationError("interval end must be after start")

    @property
    def duration_microseconds(self) -> int:
        return self.end.epoch_microseconds - self.start.epoch_microseconds

    def overlaps(self, other: "CanonicalInterval") -> bool:
        return self.start < other.end and self.end > other.start

    def contains(self, other: "CanonicalInterval") -> bool:
        return self.start <= other.start and self.end >= other.end


@dataclass(frozen=True)
class LegacyTimeEvidence:
    """Evidence required to resolve naive historical wall timestamps."""

    zone_name: str
    start_fold: Optional[int] = None
    end_fold: Optional[int] = None


@dataclass(frozen=True)
class ResolvedInterval:
    state: TimeResolution
    interval: Optional[CanonicalInterval]
    reason: Optional[str] = None

    @property
    def is_resolved(self) -> bool:
        return self.interval is not None and self.state is not TimeResolution.UNRESOLVED


def _zone(zone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(zone_name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise TimeNormalizationError(f"unknown IANA timezone: {zone_name}") from exc


def _to_epoch_microseconds(value: datetime) -> int:
    utc_value = value.astimezone(UTC)
    delta = utc_value - _EPOCH
    return (
        delta.days * _MICROSECONDS_PER_DAY
        + delta.seconds * _MICROSECONDS_PER_SECOND
        + delta.microseconds
    )


def canonical_instant(value: datetime) -> CanonicalInstant:
    """Normalize an aware datetime without using floating-point timestamps."""

    if value.tzinfo is None or value.utcoffset() is None:
        raise TimeNormalizationError("an explicit UTC offset is required")
    return CanonicalInstant(_to_epoch_microseconds(value))


def canonical_interval(start: datetime, end: datetime) -> CanonicalInterval:
    """Normalize two aware datetimes to one absolute half-open interval."""

    return CanonicalInterval(canonical_instant(start), canonical_instant(end))


def validate_offset_for_zone(value: datetime, zone_name: str) -> CanonicalInstant:
    """Validate that an explicit-offset wall time agrees with its IANA zone.

    This is stricter than converting an arbitrary instant into a display zone:
    both the wall fields and UTC offset supplied by the caller must be valid for
    ``zone_name`` at that instant.
    """

    instant = canonical_instant(value)
    local = instant.to_datetime().astimezone(_zone(zone_name))
    if (
        local.replace(tzinfo=None) != value.replace(tzinfo=None)
        or local.utcoffset() != value.utcoffset()
    ):
        raise TimeNormalizationError("explicit offset does not match IANA timezone")
    return instant


def resolve_wall_datetime(
    value: datetime,
    zone_name: str,
    *,
    fold: Optional[int] = None,
) -> CanonicalInstant:
    """Resolve a naive wall time using an explicit IANA zone and optional fold."""

    if value.tzinfo is not None:
        raise TimeNormalizationError("wall datetime must be naive")
    if fold not in (None, 0, 1):
        raise TimeNormalizationError("fold must be 0, 1, or omitted")

    zone = _zone(zone_name)
    candidates = {}
    for candidate_fold in (0, 1):
        aware = value.replace(tzinfo=zone, fold=candidate_fold)
        utc_value = aware.astimezone(UTC)
        round_trip = utc_value.astimezone(zone)
        if (
            round_trip.replace(tzinfo=None) == value
            and round_trip.fold == candidate_fold
        ):
            candidates[candidate_fold] = canonical_instant(utc_value)

    if not candidates:
        raise NonexistentWallTimeError("wall datetime falls inside a DST gap")
    if fold is None:
        if len(candidates) > 1:
            raise AmbiguousWallTimeError("DST fold must be selected explicitly")
        return next(iter(candidates.values()))
    if fold not in candidates:
        raise TimeNormalizationError(
            "selected fold is not valid for this wall datetime"
        )
    return candidates[fold]


def resolve_wall_interval(
    start: datetime,
    end: datetime,
    evidence: LegacyTimeEvidence,
) -> CanonicalInterval:
    """Resolve a legacy wall interval without wall-clock duration arithmetic."""

    return CanonicalInterval(
        resolve_wall_datetime(start, evidence.zone_name, fold=evidence.start_fold),
        resolve_wall_datetime(end, evidence.zone_name, fold=evidence.end_fold),
    )


def classify_legacy_interval(
    start: datetime,
    end: datetime,
    *,
    evidence: Optional[LegacyTimeEvidence] = None,
) -> ResolvedInterval:
    """Classify existing timestamps without silently assigning an offset.

    Aware pairs are canonical.  Naive pairs require explicit evidence.  Mixed or
    unsupported values remain unresolved so admission can fail closed.
    """

    start_aware = start.tzinfo is not None and start.utcoffset() is not None
    end_aware = end.tzinfo is not None and end.utcoffset() is not None
    if start_aware and end_aware:
        try:
            return ResolvedInterval(
                TimeResolution.CANONICAL,
                canonical_interval(start, end),
            )
        except TimeNormalizationError as exc:
            return ResolvedInterval(TimeResolution.UNRESOLVED, None, str(exc))

    if start_aware != end_aware:
        return ResolvedInterval(
            TimeResolution.UNRESOLVED,
            None,
            "mixed aware and naive interval",
        )
    if evidence is None:
        return ResolvedInterval(
            TimeResolution.UNRESOLVED,
            None,
            "naive legacy interval has no timezone evidence",
        )
    try:
        return ResolvedInterval(
            TimeResolution.RESOLVED_WITH_EVIDENCE,
            resolve_wall_interval(start, end, evidence),
        )
    except TimeNormalizationError as exc:
        return ResolvedInterval(TimeResolution.UNRESOLVED, None, str(exc))
