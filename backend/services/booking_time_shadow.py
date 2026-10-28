"""Canonical UTC metadata for writes that keep legacy wall semantics.

Legacy routes persist ``start_time``/``end_time`` as the naive digits of the
submitted value (SQLite drops tzinfo without converting). Canonical columns
are written next to those digits only when the instant is explicit: an aware
submitted value, or a zone declared by a writer that built the wall itself.
``time_zone`` names the zone in which the stored digits are wall time; it is
the master's zone only when the submitted offset matches it. A naive value is
never assumed to belong to any zone.

The mapper guard keeps every ORM write consistent: canonical columns are
derived from aware values, kept only while they still describe the stored
wall, and cleared otherwise, so no row carries partial or stale metadata.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Iterable, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import event, inspect, select

from services.calendar_time import (
    CanonicalInstant,
    CanonicalInterval,
    TimeNormalizationError,
    canonical_interval,
    resolve_wall_datetime,
)

logger = logging.getLogger(__name__)

TIME_KEYS = ("start_time", "end_time")
CANONICAL_KEYS = ("start_utc_us", "end_utc_us", "time_zone")

_HOUR = timedelta(hours=1)


def _zone(name: Optional[str]) -> Optional[ZoneInfo]:
    if not name:
        return None
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return None


def _local_wall(instant: CanonicalInstant, zone: ZoneInfo) -> datetime:
    return instant.to_datetime().astimezone(zone).replace(tzinfo=None)


def _is_aware(value: Optional[datetime]) -> bool:
    return value is not None and value.tzinfo is not None and value.utcoffset() is not None


def stored_wall(value: Optional[datetime]) -> Optional[datetime]:
    """The digits SQLite persists for a datetime value."""

    return None if value is None else value.replace(tzinfo=None)


def _fixed_offset_zone(offset: timedelta) -> Optional[str]:
    if offset == timedelta(0):
        return "UTC"
    if offset % _HOUR or not (-12 * _HOUR <= offset <= 14 * _HOUR):
        return None
    hours = int(offset / _HOUR)
    # POSIX sign convention: Etc/GMT-3 is UTC+03:00.
    return f"Etc/GMT{'-' if hours > 0 else '+'}{abs(hours)}"


def _columns(interval: CanonicalInterval, zone_name: str) -> dict:
    return {
        "start_utc_us": interval.start.epoch_microseconds,
        "end_utc_us": interval.end.epoch_microseconds,
        "time_zone": zone_name,
    }


def aware_time_columns(
    start: Optional[datetime],
    end: Optional[datetime],
    preferred_zones: Iterable[Optional[str]] = (),
) -> dict:
    """Canonical columns for aware values whose digits are persisted as-is.

    Returns ``{}`` unless both values carry an explicit offset and some zone
    reproduces both persisted digits exactly at those instants.
    """

    if not (_is_aware(start) and _is_aware(end)):
        return {}
    try:
        interval = canonical_interval(start, end)
    except TimeNormalizationError:
        return {}
    walls = (stored_wall(start), stored_wall(end))
    candidates: List[str] = [name for name in preferred_zones if name]
    if start.utcoffset() == end.utcoffset():
        fixed = _fixed_offset_zone(start.utcoffset())
        if fixed:
            candidates.append(fixed)
    for name in candidates:
        zone = _zone(name)
        if zone is None:
            continue
        if (_local_wall(interval.start, zone), _local_wall(interval.end, zone)) == walls:
            return _columns(interval, name)
    return {}


def wall_time_columns(start: datetime, end: datetime, zone_name: str) -> dict:
    """Canonical columns for naive walls a writer built in a declared zone.

    Only for writers that construct the wall themselves in ``zone_name``;
    DST gaps, ambiguous folds and unknown zones return ``{}``.
    """

    if start is None or end is None or start.tzinfo is not None or end.tzinfo is not None:
        return {}
    if not isinstance(zone_name, str) or not zone_name:
        return {}
    try:
        interval = CanonicalInterval(
            resolve_wall_datetime(start, zone_name), resolve_wall_datetime(end, zone_name)
        )
    except TimeNormalizationError:
        return {}
    return _columns(interval, zone_name)


def is_consistent(
    *,
    start_time: Optional[datetime],
    end_time: Optional[datetime],
    start_utc_us: Optional[int],
    end_utc_us: Optional[int],
    time_zone: Optional[str],
) -> bool:
    """Complete canonical metadata that describes exactly the stored wall."""

    from services.calendar_adapters import stored_interval

    if start_utc_us is None or end_utc_us is None or time_zone is None:
        return False
    return stored_interval(
        start_utc_us=start_utc_us,
        end_utc_us=end_utc_us,
        time_zone=time_zone,
        start_time=stored_wall(start_time),
        end_time=stored_wall(end_time),
    ).is_resolved


def _row_consistent(target) -> bool:
    return is_consistent(**{key: getattr(target, key) for key in TIME_KEYS + CANONICAL_KEYS})


def hold_time_columns(hold) -> dict:
    """Canonical columns a promoted booking inherits from its hold's wall."""

    if not _row_consistent(hold):
        return {}
    return {key: getattr(hold, key) for key in CANONICAL_KEYS}


def online_origin_metadata(actor_user_id: Optional[int]) -> dict:
    """Provenance of a route-created booking; marks it as a post-B2.1 write."""

    from services.calendar_adapters import BookingSource

    return {"source": BookingSource.ONLINE.value, "created_by_user_id": actor_user_id}


def _owner_zone(connection, target) -> Optional[str]:
    from models import IndieMaster, Master

    master_id = getattr(target, "master_id", None)
    if master_id is None and getattr(target, "indie_master_id", None) is not None:
        master_id = connection.execute(
            select(IndieMaster.master_id).where(IndieMaster.id == target.indie_master_id)
        ).scalar()
    if master_id is None:
        return None
    return connection.execute(select(Master.timezone).where(Master.id == master_id)).scalar()


def _clear(target, reason: str) -> None:
    if any(getattr(target, key) is not None for key in CANONICAL_KEYS):
        logger.warning(
            "calendar: cleared canonical time on %s id=%s (%s)",
            type(target).__name__,
            getattr(target, "id", None),
            reason,
        )
    for key in CANONICAL_KEYS:
        setattr(target, key, None)


def _guard_time_metadata(mapper, connection, target) -> None:
    state = inspect(target)
    changed = lambda keys: any(state.attrs[key].history.has_changes() for key in keys)  # noqa: E731
    explicit = changed(CANONICAL_KEYS) and any(
        getattr(target, key) is not None for key in CANONICAL_KEYS
    )
    if explicit:
        if not _row_consistent(target):
            _clear(target, "canonical metadata does not describe the stored wall")
        return
    if not (state.pending or changed(TIME_KEYS)):
        return
    if _is_aware(target.start_time) or _is_aware(target.end_time):
        columns = aware_time_columns(
            target.start_time,
            target.end_time,
            (target.time_zone, _owner_zone(connection, target)),
        )
        if columns:
            for key, value in columns.items():
                setattr(target, key, value)
        else:
            _clear(target, "submitted offset does not prove the stored wall")
        return
    if not _row_consistent(target):
        _clear(target, "wall changed without time zone evidence")


def install_time_metadata_guards(*models) -> None:
    for model in models:
        for name in ("before_insert", "before_update"):
            if not event.contains(model, name, _guard_time_metadata):
                event.listen(model, name, _guard_time_metadata)
