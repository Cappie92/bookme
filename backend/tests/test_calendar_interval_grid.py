"""Calendar 30-minute grid contract — application + SQLite trigger rejection."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from services.booking_admission import request_interval
from services.calendar_time import CanonicalInstant, canonical_instant
from utils.calendar_interval_grid import (
    CALENDAR_GRID_ERROR_CODE,
    CalendarIntervalGridError,
    enforce_calendar_interval_wall_grid,
    grid_interval_from_duration,
    service_duration_allowed_for_grid,
)
from utils.sqlite_calendar_grid_guard import (
    apply_sqlite_booking_grid_triggers,
    register_sqlite_calendar_guard_udfs,
)


def test_enforce_rejects_off_grid_start():
    start = datetime(2026, 11, 11, 19, 11, 13)
    end = datetime(2026, 11, 11, 19, 41, 0)
    with pytest.raises(CalendarIntervalGridError):
        enforce_calendar_interval_wall_grid(start, end, "Europe/Moscow")


def test_enforce_accepts_valid_half_hour():
    start = datetime(2026, 11, 11, 19, 0, 0)
    end = datetime(2026, 11, 11, 19, 30, 0)
    enforce_calendar_interval_wall_grid(start, end, "Europe/Moscow")


def test_grid_interval_from_duration():
    start, end = grid_interval_from_duration(
        datetime(2026, 11, 12, 23, 5, 0),
        30,
        "Europe/Moscow",
    )
    assert start.minute == 0 and start.second == 0
    assert end.minute == 30 and end.second == 0


def test_sqlite_trigger_rejects_direct_insert():
    conn = sqlite3.connect(":memory:")
    conn.execute(
        """CREATE TABLE bookings (
            id INTEGER PRIMARY KEY,
            start_time DATETIME,
            end_time DATETIME,
            start_utc_us INTEGER,
            end_utc_us INTEGER,
            time_zone TEXT
        )"""
    )
    register_sqlite_calendar_guard_udfs(conn)
    apply_sqlite_booking_grid_triggers(conn)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO bookings (id, start_time, end_time) VALUES (1, ?, ?)",
            ("2026-11-11 19:11:13", "2026-11-11 19:41:13"),
        )
    conn.execute(
        "INSERT INTO bookings (id, start_time, end_time) VALUES (2, ?, ?)",
        ("2026-11-11 19:00:00", "2026-11-11 19:30:00"),
    )
    row = conn.execute("SELECT id FROM bookings WHERE id=2").fetchone()
    assert row[0] == 2
    conn.close()


def test_error_code_constant():
    assert CALENDAR_GRID_ERROR_CODE == "BOOKING_INTERVAL_OFF_GRID"


def test_enforce_accepts_dst_fall_back_when_wall_clock_runs_backward():
    zone = "America/New_York"
    tz = ZoneInfo(zone)
    start = datetime(2025, 11, 2, 1, 30, fold=0, tzinfo=tz)
    end_us = canonical_instant(start).epoch_microseconds + 30 * 60 * 1_000_000
    end = CanonicalInstant(end_us).to_datetime().astimezone(tz)
    assert end.replace(tzinfo=None) <= start.replace(tzinfo=None)
    enforce_calendar_interval_wall_grid(start, end, zone)


def test_request_interval_mixed_naive_start_and_aware_end_moscow():
    zone = "Europe/Moscow"
    tz = ZoneInfo(zone)
    start = datetime(2026, 11, 14, 10, 0, 0)
    end = datetime(2026, 11, 14, 10, 30, tzinfo=tz)
    interval = request_interval(start, end, zone)
    assert interval.duration_microseconds == 30 * 60 * 1_000_000


def test_request_interval_mixed_off_grid_returns_400():
    zone = "Europe/Moscow"
    tz = ZoneInfo(zone)
    start = datetime(2026, 11, 14, 10, 11, 0)
    end = datetime(2026, 11, 14, 10, 41, tzinfo=tz)
    with pytest.raises(HTTPException) as exc:
        request_interval(start, end, zone)
    assert exc.value.status_code == 400
    assert exc.value.headers.get("X-Error-Code") == CALENDAR_GRID_ERROR_CODE


def test_request_interval_dst_fall_back_fold0_to_fold1_30min():
    zone = "America/New_York"
    tz = ZoneInfo(zone)
    start = datetime(2025, 11, 2, 1, 30, fold=0, tzinfo=tz)
    end_us = canonical_instant(start).epoch_microseconds + 30 * 60 * 1_000_000
    end = CanonicalInstant(end_us).to_datetime().astimezone(tz)
    assert end.fold == 1
    assert (end.hour, end.minute) == (1, 0)
    assert end.replace(tzinfo=None) < start.replace(tzinfo=None)
    interval = request_interval(start, end, zone)
    assert interval.duration_microseconds == 30 * 60 * 1_000_000


@pytest.mark.parametrize(
    "value,expected",
    [
        (30, True),
        (60, True),
        (None, True),
        (30.0, True),
        (30.9, False),
        (0, False),
        (-30, False),
        (45, False),
        (True, False),
    ],
)
def test_service_duration_allowed_for_grid_strict(value, expected):
    assert service_duration_allowed_for_grid(value) is expected