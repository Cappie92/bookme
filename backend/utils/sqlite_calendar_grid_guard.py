"""SQLite calendar interval guards (UDF + triggers).

Bookings store naive wall `start_time` / `end_time` in the master's zone.
Calendar blocks store canonical UTC microseconds plus `time_zone`.

Triggers call deterministic Python UDFs (ZoneInfo). Without registered UDFs,
SQLite fails the statement — external SQL / DB CLI fail closed.
"""

from __future__ import annotations

import re
from datetime import datetime
from numbers import Integral, Real
from typing import Any, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo

from utils.calendar_interval_grid import CALENDAR_GRID_STEP_MINUTES

_GUARD_ERROR = "BOOKING_INTERVAL_OFF_GRID"
_STEP_US = CALENDAR_GRID_STEP_MINUTES * 60 * 1_000_000
_GRID_MINUTES = frozenset({0, 30})

_WALL_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$"
)

BOOKING_TRIGGER_NAMES = (
    "bookings_calendar_guard_insert",
    "bookings_calendar_guard_update",
)

BLOCK_TRIGGER_NAMES = (
    "calendar_blocks_guard_insert",
    "calendar_blocks_guard_update",
)


def _coerce_db_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", errors="replace")
    return value


def _parse_int_us(value: Any) -> Optional[int]:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, Real) and not isinstance(value, Integral):
        if float(value).is_integer():
            return int(value)
        return None
    text = str(value).strip()
    if re.fullmatch(r"-?\d+", text):
        return int(text)
    return None


def _parse_wall_naive(value: Any) -> Optional[datetime]:
    """Parse stored booking wall time; reject sub-second fractions."""
    value = _coerce_db_value(value)
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return None
        if value.microsecond != 0:
            return None
        return value.replace(microsecond=0)
    text = str(value).strip()
    m = _WALL_RE.match(text)
    if not m:
        return None
    y, mo, d = int(m.group(1)[:4]), int(m.group(1)[5:7]), int(m.group(1)[8:10])
    h, mi, sec = int(m.group(2)), int(m.group(3)), int(m.group(4))
    frac = m.group(5)
    if frac is not None:
        if len(frac) > 6:
            return None
        micro = int(frac.ljust(6, "0")[:6])
        if micro != 0:
            return None
    try:
        return datetime(y, mo, d, h, mi, sec, 0)
    except ValueError:
        return None


def _wall_on_grid(dt: datetime) -> bool:
    return dt.minute in _GRID_MINUTES and dt.second == 0 and dt.microsecond == 0


def _naive_wall_duration_minutes(start: datetime, end: datetime) -> int:
    delta = end - start
    if delta.total_seconds() <= 0:
        return -1
    return int(delta.total_seconds() // 60)


def _wall_from_utc_us(epoch_us: int, zone_name: str) -> Optional[datetime]:
    try:
        zone = ZoneInfo(zone_name)
    except Exception:
        return None
    from services.calendar_time import CanonicalInstant

    aware = CanonicalInstant(epoch_us).to_datetime().astimezone(zone)
    wall = aware.replace(tzinfo=None)
    if not _wall_on_grid(wall):
        return None
    if aware.microsecond != 0:
        return None
    return wall


def _canonical_triple_complete(start_us: Any, end_us: Any, zone: Any) -> bool:
    return start_us is not None and end_us is not None and zone not in (None, "")


def _canonical_triple_empty(start_us: Any, end_us: Any, zone: Any) -> bool:
    return start_us is None and end_us is None and zone in (None, "")


def _validate_canonical_interval(start_us: int, end_us: int, zone: str) -> int:
    if end_us <= start_us:
        return 1
    elapsed = end_us - start_us
    if elapsed % _STEP_US != 0:
        return 1
    if _wall_from_utc_us(start_us, zone) is None or _wall_from_utc_us(end_us, zone) is None:
        return 1
    return 0


def sqlite_validate_booking_row(
    start_time: Any,
    end_time: Any,
    start_utc_us: Any,
    end_utc_us: Any,
    time_zone: Any,
) -> int:
    """Return 0 when valid; non-zero for RAISE(ABORT) in triggers."""

    has_start = start_time is not None
    has_end = end_time is not None

    canonical = _canonical_triple_complete(start_utc_us, end_utc_us, time_zone)
    legacy_canonical_empty = _canonical_triple_empty(start_utc_us, end_utc_us, time_zone)
    if not canonical and not legacy_canonical_empty:
        return 1

    if not has_start and not has_end:
        if legacy_canonical_empty:
            return 0
        return 1

    if has_start != has_end:
        if legacy_canonical_empty:
            return 0
        return 1

    start = _parse_wall_naive(start_time)
    end = _parse_wall_naive(end_time)
    if start is None or end is None:
        return 1
    if not _wall_on_grid(start) or not _wall_on_grid(end):
        return 1

    if canonical:
        s_us = _parse_int_us(start_utc_us)
        e_us = _parse_int_us(end_utc_us)
        if s_us is None or e_us is None:
            return 1
        if _validate_canonical_interval(s_us, e_us, str(time_zone)) != 0:
            return 1
        wall_s = _wall_from_utc_us(s_us, str(time_zone))
        wall_e = _wall_from_utc_us(e_us, str(time_zone))
        if wall_s is None or wall_e is None:
            return 1
        if wall_s != start or wall_e != end:
            return 1
        return 0

    minutes = _naive_wall_duration_minutes(start, end)
    if minutes <= 0 or minutes % CALENDAR_GRID_STEP_MINUTES != 0:
        return 1
    return 0


def sqlite_validate_calendar_block_row(
    start_utc_us: Any,
    end_utc_us: Any,
    time_zone: Any,
) -> int:
    if not _canonical_triple_complete(start_utc_us, end_utc_us, time_zone):
        return 1
    s_us = _parse_int_us(start_utc_us)
    e_us = _parse_int_us(end_utc_us)
    if s_us is None or e_us is None:
        return 1
    return _validate_canonical_interval(s_us, e_us, str(time_zone))


def register_sqlite_calendar_guard_udfs(connection) -> None:
    connection.create_function(
        "dedato_sqlite_validate_booking_row",
        5,
        sqlite_validate_booking_row,
        deterministic=True,
    )
    connection.create_function(
        "dedato_sqlite_validate_calendar_block_row",
        3,
        sqlite_validate_calendar_block_row,
        deterministic=True,
    )


_LEGACY_TRIGGER_NAMES = (
    "bookings_enforce_grid_insert",
    "bookings_enforce_grid_update",
)

_DROP_BOOKING = tuple(
    f"DROP TRIGGER IF EXISTS {n};"
    for n in (*BOOKING_TRIGGER_NAMES, *_LEGACY_TRIGGER_NAMES)
)
_DROP_BLOCKS = tuple(f"DROP TRIGGER IF EXISTS {n};" for n in BLOCK_TRIGGER_NAMES)

_BOOKING_INSERT = f"""
CREATE TRIGGER IF NOT EXISTS {BOOKING_TRIGGER_NAMES[0]}
BEFORE INSERT ON bookings
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, '{_GUARD_ERROR}')
  WHERE dedato_sqlite_validate_booking_row(
    NEW.start_time, NEW.end_time, NEW.start_utc_us, NEW.end_utc_us, NEW.time_zone
  ) != 0;
END;
"""

_BOOKING_UPDATE = f"""
CREATE TRIGGER IF NOT EXISTS {BOOKING_TRIGGER_NAMES[1]}
BEFORE UPDATE ON bookings
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, '{_GUARD_ERROR}')
  WHERE dedato_sqlite_validate_booking_row(
    NEW.start_time, NEW.end_time, NEW.start_utc_us, NEW.end_utc_us, NEW.time_zone
  ) != 0;
END;
"""

_BLOCK_INSERT = f"""
CREATE TRIGGER IF NOT EXISTS {BLOCK_TRIGGER_NAMES[0]}
BEFORE INSERT ON calendar_blocks
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, '{_GUARD_ERROR}')
  WHERE dedato_sqlite_validate_calendar_block_row(
    NEW.start_utc_us, NEW.end_utc_us, NEW.time_zone
  ) != 0;
END;
"""

_BLOCK_UPDATE = f"""
CREATE TRIGGER IF NOT EXISTS {BLOCK_TRIGGER_NAMES[1]}
BEFORE UPDATE ON calendar_blocks
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, '{_GUARD_ERROR}')
  WHERE dedato_sqlite_validate_calendar_block_row(
    NEW.start_utc_us, NEW.end_utc_us, NEW.time_zone
  ) != 0;
END;
"""

_GUARD_DDL: Tuple[str, ...] = (
    *_DROP_BOOKING,
    *_DROP_BLOCKS,
    _BOOKING_INSERT,
    _BOOKING_UPDATE,
    _BLOCK_INSERT,
    _BLOCK_UPDATE,
)


def apply_sqlite_calendar_grid_guards(
    connection,
    *,
    only_tables: Optional[set[str]] = None,
) -> None:
    """Install trigger DDL on the caller's connection; never commits."""
    register_sqlite_calendar_guard_udfs(connection)
    cursor = connection.cursor()
    existing = {
        row[0]
        for row in cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    want = (
        {"bookings", "calendar_blocks"}
        if only_tables is None
        else set(only_tables)
    )
    stmts: list[str] = []
    if "bookings" in want and "bookings" in existing:
        stmts.extend(_DROP_BOOKING)
        stmts.extend((_BOOKING_INSERT, _BOOKING_UPDATE))
    if "calendar_blocks" in want and "calendar_blocks" in existing:
        stmts.extend(_DROP_BLOCKS)
        stmts.extend((_BLOCK_INSERT, _BLOCK_UPDATE))
    for stmt in stmts:
        cursor.execute(stmt)


def iter_invalid_booking_rows(connection) -> Sequence[Tuple[int, str]]:
    rows = connection.execute(
        "SELECT id, start_time, end_time, start_utc_us, end_utc_us, time_zone FROM bookings"
    ).fetchall()
    bad: list[Tuple[int, str]] = []
    for rid, start, end, s_us, e_us, tz in rows:
        has_wall = start is not None or end is not None
        has_canonical = _canonical_triple_complete(s_us, e_us, tz)
        if not has_wall and not has_canonical:
            continue
        if sqlite_validate_booking_row(start, end, s_us, e_us, tz) != 0:
            bad.append((int(rid), "booking"))
    return bad


def iter_invalid_calendar_block_rows(connection) -> Sequence[Tuple[int, str]]:
    rows = connection.execute(
        "SELECT id, start_utc_us, end_utc_us, time_zone FROM calendar_blocks"
    ).fetchall()
    bad: list[Tuple[int, str]] = []
    for rid, s, e, z in rows:
        if sqlite_validate_calendar_block_row(s, e, z) != 0:
            bad.append((int(rid), "calendar_block"))
    return bad


apply_sqlite_booking_grid_triggers = apply_sqlite_calendar_grid_guards
BOOKINGS_GRID_TRIGGER_NAMES = BOOKING_TRIGGER_NAMES