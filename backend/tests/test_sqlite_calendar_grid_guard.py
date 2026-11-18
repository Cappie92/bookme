"""SQLite calendar grid guards on real booking/block schema."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import create_engine, text

import models  # noqa: F401 — register models
from database import Base, install_sqlite_calendar_guard_hooks
from services.calendar_time import canonical_instant
from services.booking_admission import request_interval
from utils.sqlite_calendar_grid_guard import (
    apply_sqlite_calendar_grid_guards,
    register_sqlite_calendar_guard_udfs,
    sqlite_validate_booking_row,
    sqlite_validate_calendar_block_row,
)


@pytest.fixture()
def guarded_db(tmp_path):
    path = tmp_path / "grid_guard.sqlite"
    engine = create_engine(f"sqlite:///{path}")
    install_sqlite_calendar_guard_hooks(engine)
    Base.metadata.create_all(bind=engine)
    engine.dispose()
    conn = sqlite3.connect(path)
    register_sqlite_calendar_guard_udfs(conn)
    yield conn, path
    conn.close()


def _triggers(conn) -> set[str]:
    return {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='trigger'"
    ).fetchall()}


def test_create_all_installs_both_table_triggers(guarded_db):
    conn, _ = guarded_db
    names = _triggers(conn)
    assert "bookings_calendar_guard_insert" in names
    assert "calendar_blocks_guard_insert" in names


def _insert_booking(conn, **values):
    cols = [
        "id",
        "start_time",
        "end_time",
        "start_utc_us",
        "end_utc_us",
        "time_zone",
        "public_reference",
    ]
    defaults = {
        "id": 100,
        "start_time": "2026-11-11 19:00:00",
        "end_time": "2026-11-11 19:30:00",
        "start_utc_us": None,
        "end_utc_us": None,
        "time_zone": None,
        "public_reference": "pubref-test-100",
    }
    defaults.update(values)
    conn.execute(
        f"INSERT INTO bookings ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})",
        tuple(defaults[c] for c in cols),
    )


def test_booking_guard_many_valid_half_hours(guarded_db):
    conn, _ = guarded_db
    for hour, minute, duration in ((10, 0, 30), (14, 30, 60), (19, 0, 30)):
        end_min = minute + duration
        end_hour = hour + end_min // 60
        end_min = end_min % 60
        _insert_booking(
            conn,
            id=hour * 10 + minute,
            start_time=f"2026-11-12 {hour:02d}:{minute:02d}:00",
            end_time=f"2026-11-12 {end_hour:02d}:{end_min:02d}:00",
            public_reference=f"ok-{hour}-{minute}",
        )
    conn.commit()


@pytest.mark.parametrize(
    "start,end",
    [
        ("2026-11-11 19:11:00", "2026-11-11 19:41:00"),
        ("2026-11-11 19:00:01", "2026-11-11 19:30:00"),
        ("2026-11-11 19:00:00.000001", "2026-11-11 19:30:00"),
        ("not-a-date", "2026-11-11 19:30:00"),
        ("2026-11-11 19:30:00", "2026-11-11 19:00:00"),
        ("2026-11-11 19:00:00", "2026-11-11 19:45:00"),
    ],
)
def test_booking_guard_rejects_invalid_wall(guarded_db, start, end):
    conn, _ = guarded_db
    with pytest.raises(sqlite3.IntegrityError):
        _insert_booking(conn, id=200, start_time=start, end_time=end, public_reference="bad-wall")
        conn.commit()


def test_empty_row_helper_allows_legacy_incomplete():
    assert sqlite_validate_booking_row(None, None, None, None, None) == 0


def test_booking_guard_allows_legacy_incomplete_wall(guarded_db):
    conn, _ = guarded_db
    _insert_booking(conn, id=201, start_time=None, end_time=None, public_reference="legacy-no-wall")
    _insert_booking(
        conn,
        id=202,
        start_time="2026-11-11 19:00:00",
        end_time=None,
        public_reference="legacy-start-only",
    )
    conn.commit()


def test_canonical_without_wall_rejects_sql(guarded_db):
    conn, _ = guarded_db
    zone = "Europe/Moscow"
    start = datetime(2026, 11, 11, 10, 0, 0)
    end = start + timedelta(minutes=30)
    interval = request_interval(start, end, zone)
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            """INSERT INTO bookings
            (id, start_time, end_time, start_utc_us, end_utc_us, time_zone, public_reference)
            VALUES (901, NULL, NULL, ?, ?, ?, 'canonical-no-wall')""",
            (interval.start.epoch_microseconds, interval.end.epoch_microseconds, zone),
        )
        conn.commit()


def test_canonical_microsecond_and_non_integer_reject(guarded_db):
    conn, _ = guarded_db
    zone = "Europe/Moscow"
    start = datetime(2026, 11, 11, 19, 0, 0)
    end = start + timedelta(minutes=30)
    interval = request_interval(start, end, zone)
    bad_end = interval.end.epoch_microseconds + 1
    assert sqlite_validate_booking_row(
        start,
        end,
        interval.start.epoch_microseconds,
        bad_end,
        zone,
    ) == 1
    with pytest.raises(sqlite3.IntegrityError):
        _insert_booking(
            conn,
            id=250,
            start_time="2026-11-11 19:00:00",
            end_time="2026-11-11 19:30:00",
            start_utc_us=interval.start.epoch_microseconds,
            end_utc_us=bad_end,
            time_zone=zone,
            public_reference="bad-us",
        )
        conn.commit()
    with pytest.raises(sqlite3.IntegrityError):
        _insert_booking(
            conn,
            id=251,
            start_time="2026-11-11 19:00:00",
            end_time="2026-11-11 19:30:00",
            start_utc_us=interval.start.epoch_microseconds + 0.5,
            end_utc_us=interval.end.epoch_microseconds,
            time_zone=zone,
            public_reference="bad-float",
        )
        conn.commit()


def test_booking_guard_canonical_must_match_wall(guarded_db):
    conn, _ = guarded_db
    zone = "Europe/Moscow"
    start = datetime(2026, 11, 11, 19, 0, 0)
    end = start + timedelta(minutes=30)
    interval = request_interval(start, end, zone)
    with pytest.raises(sqlite3.IntegrityError):
        _insert_booking(
            conn,
            id=301,
            start_time="2026-11-11 20:00:00",
            end_time="2026-11-11 20:30:00",
            start_utc_us=interval.start.epoch_microseconds,
            end_utc_us=interval.end.epoch_microseconds,
            time_zone=zone,
            public_reference="canonical-mismatch",
        )
        conn.commit()


def test_block_guard_kathmandu_and_deleted_at_still_checked(guarded_db):
    conn, _ = guarded_db
    conn.execute("PRAGMA foreign_keys=OFF")
    zone = "Asia/Kathmandu"
    wall_start = datetime(2026, 11, 11, 10, 0, 0)
    wall_end = wall_start + timedelta(minutes=30)
    tz = ZoneInfo(zone)
    start_us = canonical_instant(wall_start.replace(tzinfo=tz)).epoch_microseconds
    end_us = canonical_instant(wall_end.replace(tzinfo=tz)).epoch_microseconds
    conn.execute(
        """INSERT INTO calendar_blocks
        (id, master_id, created_by_user_id, category, start_utc_us, end_utc_us,
         time_zone, version, deleted_at, created_at, updated_at)
        VALUES (1, 1, 1, 'personal', ?, ?, ?, 1,
                '2026-11-01 12:00:00', '2026-11-01 12:00:00', '2026-11-01 12:00:00')""",
        (start_us, end_us, zone),
    )
    conn.commit()
    bad_us = end_us + 60 * 1_000_000
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO calendar_blocks "
            "(id, master_id, created_by_user_id, category, start_utc_us, end_utc_us, "
            "time_zone, version, deleted_at, created_at, updated_at) "
            "VALUES (2, 1, 1, 'personal', ?, ?, ?, 1, '2099-01-01 00:00:00', "
            "'2026-11-01 12:00:00', '2026-11-01 12:00:00')",
            (start_us, bad_us, zone),
        )
        conn.commit()


def test_ny_fall_back_canonical_utc_elapsed_when_wall_runs_backward(guarded_db):
    conn, _ = guarded_db
    zone = "America/New_York"
    tz = ZoneInfo(zone)
    first = datetime(2025, 11, 2, 1, 30, fold=0, tzinfo=tz)
    start_us = canonical_instant(first).epoch_microseconds
    end_us = start_us + 30 * 60 * 1_000_000
    from services.calendar_time import CanonicalInstant

    wall_s = first.replace(tzinfo=None)
    wall_e = CanonicalInstant(end_us).to_datetime().astimezone(tz).replace(tzinfo=None)
    assert wall_e <= wall_s
    assert sqlite_validate_booking_row(wall_s, wall_e, start_us, end_us, zone) == 0
    _insert_booking(
        conn,
        id=401,
        start_time=wall_s.strftime("%Y-%m-%d %H:%M:%S"),
        end_time=wall_e.strftime("%Y-%m-%d %H:%M:%S"),
        start_utc_us=start_us,
        end_utc_us=end_us,
        time_zone=zone,
        public_reference="dst-fold",
    )
    conn.commit()


def test_raw_sql_without_udf_fails_closed():
    conn = sqlite3.connect(":memory:")
    conn.execute(
        """CREATE TABLE bookings (
            id INTEGER PRIMARY KEY, start_time TEXT, end_time TEXT,
            start_utc_us INTEGER, end_utc_us INTEGER, time_zone TEXT
        )"""
    )
    from utils.sqlite_calendar_grid_guard import _BOOKING_INSERT

    conn.executescript(_BOOKING_INSERT)
    with pytest.raises(sqlite3.OperationalError):
        conn.execute(
            "INSERT INTO bookings VALUES (1, '2026-11-11 19:00:00', '2026-11-11 19:30:00', NULL, NULL, NULL)"
        )