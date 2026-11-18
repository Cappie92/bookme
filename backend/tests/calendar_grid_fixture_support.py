"""Explicit helpers for positive pytest fixtures on SQLite calendar grid.

Call ``snap_naive_booking_interval`` only when building intentional on-grid
booking rows. Do not attach to ORM ``before_insert`` / ``before_update``:
negative interval and guard tests must reach production validators unchanged.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from utils.calendar_interval_grid import CALENDAR_GRID_STEP_MINUTES


def snap_naive_wall(dt: datetime) -> datetime:
    minute = (dt.minute // CALENDAR_GRID_STEP_MINUTES) * CALENDAR_GRID_STEP_MINUTES
    return dt.replace(minute=minute, second=0, microsecond=0)


def _coerce_naive_wall(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


def snap_naive_booking_interval(
    start: datetime,
    end: datetime,
) -> tuple[datetime, datetime]:
    start = _coerce_naive_wall(start)
    end = _coerce_naive_wall(end)
    start_s = snap_naive_wall(start)
    raw_minutes = int((end - start).total_seconds() // 60)
    if raw_minutes <= 0:
        raw_minutes = CALENDAR_GRID_STEP_MINUTES
    duration = max(
        CALENDAR_GRID_STEP_MINUTES,
        (
            (raw_minutes + CALENDAR_GRID_STEP_MINUTES - 1)
            // CALENDAR_GRID_STEP_MINUTES
        )
        * CALENDAR_GRID_STEP_MINUTES,
    )
    return start_s, start_s + timedelta(minutes=duration)