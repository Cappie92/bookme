"""after_create installs guards only for newly created calendar tables."""

from __future__ import annotations

import sqlite3

import pytest
from sqlalchemy import create_engine, text

import models  # noqa: F401
from database import Base, install_sqlite_calendar_guard_hooks
from utils.sqlite_calendar_grid_guard import register_sqlite_calendar_guard_udfs


def _trigger_names(conn) -> set[str]:
    return {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='trigger'"
    ).fetchall()}


@pytest.fixture()
def engine_factory(tmp_path):
    counter = {"n": 0}

    def _make():
        counter["n"] += 1
        path = tmp_path / f"db-{counter['n']}.sqlite"
        eng = create_engine(f"sqlite:///{path}")
        install_sqlite_calendar_guard_hooks(eng)
        return eng, path

    return _make


def test_fresh_create_all_installs_guards(engine_factory):
    engine, path = engine_factory()
    Base.metadata.create_all(bind=engine)
    engine.dispose()
    conn = sqlite3.connect(path)
    names = _trigger_names(conn)
    assert "bookings_calendar_guard_insert" in names
    assert "calendar_blocks_guard_insert" in names
    conn.close()


def test_repeat_create_all_on_dirty_db_does_not_install_guards(engine_factory):
    engine, path = engine_factory()
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE bookings ("
        "id INTEGER PRIMARY KEY, start_time TEXT, end_time TEXT, "
        "start_utc_us INTEGER, end_utc_us INTEGER, time_zone TEXT, public_reference TEXT)"
    )
    conn.execute(
        "INSERT INTO bookings VALUES (1, '2026-11-11 19:11:00', '2026-11-11 19:41:00', "
        "NULL, NULL, NULL, 'dirty')"
    )
    conn.commit()
    conn.close()
    Base.metadata.create_all(bind=engine, checkfirst=True)
    engine.dispose()
    conn = sqlite3.connect(path)
    assert "bookings_calendar_guard_insert" not in _trigger_names(conn)
    conn.close()


def test_engine_pool_reconnect_registers_udf():
    import tempfile

    path = tempfile.NamedTemporaryFile(suffix=".sqlite").name
    engine = create_engine(f"sqlite:///{path}", pool_pre_ping=True)
    install_sqlite_calendar_guard_hooks(engine)
    with engine.connect() as conn1:
        raw1 = conn1.connection.dbapi_connection
        register_sqlite_calendar_guard_udfs(raw1)
        assert raw1.execute("SELECT dedato_sqlite_validate_booking_row(NULL,NULL,NULL,NULL,NULL)").fetchone()[0] == 0
    engine.dispose()
    engine = create_engine(f"sqlite:///{path}")
    install_sqlite_calendar_guard_hooks(engine)
    with engine.connect() as conn2:
        raw2 = conn2.connection.dbapi_connection
        assert raw2.execute(
            "SELECT dedato_sqlite_validate_booking_row('2026-11-11 10:00:00',"
            "'2026-11-11 10:30:00', NULL, NULL, NULL)"
        ).fetchone()[0] == 0
    engine.dispose()