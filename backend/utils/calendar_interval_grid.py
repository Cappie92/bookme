"""30-minute wall grid for calendar bookings and personal blocks.

Both interval boundaries must fall on :00 or :30 with zero seconds/subseconds.
Duration must be a positive multiple of 30 minutes.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from numbers import Integral
from typing import Optional, Tuple, Union
from zoneinfo import ZoneInfo

CALENDAR_GRID_STEP_MINUTES = 30
CALENDAR_GRID_ERROR_CODE = "BOOKING_INTERVAL_OFF_GRID"

_GRID_MINUTES = frozenset({0, 30})


class CalendarIntervalGridError(ValueError):
    def __init__(self, message: str, code: str = CALENDAR_GRID_ERROR_CODE):
        super().__init__(message)
        self.code = code


def _local_wall_parts(dt: datetime, zone_name: str) -> Tuple[int, int, int, int]:
    if dt.tzinfo is None:
        local = dt
    else:
        local = dt.astimezone(ZoneInfo(zone_name)).replace(tzinfo=None)
    return local.minute, local.second, local.microsecond, local.hour


def _assert_boundary_on_grid(dt: datetime, zone_name: str, label: str) -> None:
    minute, second, microsecond, _hour = _local_wall_parts(dt, zone_name)
    if minute not in _GRID_MINUTES:
        raise CalendarIntervalGridError(
            f"{label}: время должно начинаться/заканчиваться в :00 или :30 (получено :{minute:02d})"
        )
    if second != 0 or microsecond != 0:
        raise CalendarIntervalGridError(
            f"{label}: секунды и доли секунды должны быть нулевыми"
        )


def duration_minutes(start: datetime, end: datetime) -> float:
    """Elapsed minutes on the absolute timeline (DST-safe for aware instants)."""

    if start.tzinfo is not None and end.tzinfo is not None:
        return (
            end.astimezone(timezone.utc) - start.astimezone(timezone.utc)
        ).total_seconds() / 60.0
    if start.tzinfo is None and end.tzinfo is None:
        return (end - start).total_seconds() / 60.0
    raise CalendarIntervalGridError(
        "Смешанные naive и aware границы нужно нормализовать до сравнения elapsed"
    )




def _interval_positive_elapsed(start: datetime, end: datetime) -> float:
    """Reject non-positive spans; ordering uses duration_minutes (UTC for aware)."""

    minutes = duration_minutes(start, end)
    if minutes <= 0:
        raise CalendarIntervalGridError("Время окончания должно быть позже начала")
    return minutes


def enforce_calendar_interval_wall_grid(
    start: datetime,
    end: datetime,
    zone_name: str,
) -> None:
    _assert_boundary_on_grid(start, zone_name, "Начало")
    _assert_boundary_on_grid(end, zone_name, "Окончание")
    minutes = _interval_positive_elapsed(start, end)
    if minutes <= 0 or abs(minutes % CALENDAR_GRID_STEP_MINUTES) > 1e-6:
        raise CalendarIntervalGridError(
            f"Длительность должна быть кратна {CALENDAR_GRID_STEP_MINUTES} мин"
        )


def snap_to_grid_utc(dt: datetime, zone_name: str) -> datetime:
    if dt.tzinfo is not None:
        dt = dt.astimezone(ZoneInfo(zone_name)).replace(tzinfo=None)
    minute = (dt.minute // CALENDAR_GRID_STEP_MINUTES) * CALENDAR_GRID_STEP_MINUTES
    return dt.replace(minute=minute, second=0, microsecond=0)


def grid_interval_from_duration(
    start: datetime,
    duration_minutes: int,
    zone_name: str,
) -> Tuple[datetime, datetime]:
    start = snap_to_grid_utc(start, zone_name)
    if duration_minutes % CALENDAR_GRID_STEP_MINUTES != 0:
        raise CalendarIntervalGridError("duration_minutes must be a multiple of 30")
    end = start + timedelta(minutes=duration_minutes)
    enforce_calendar_interval_wall_grid(start, end, zone_name)
    return start, end


def service_duration_allowed_for_grid(
    service_duration: Optional[Union[int, float]],
) -> bool:
    if service_duration is None:
        return True
    if isinstance(service_duration, bool):
        return False
    if isinstance(service_duration, float):
        if not service_duration.is_integer():
            return False
        minutes = int(service_duration)
    elif isinstance(service_duration, Integral):
        minutes = int(service_duration)
    else:
        return False
    if minutes <= 0:
        return False
    return minutes % CALENDAR_GRID_STEP_MINUTES == 0