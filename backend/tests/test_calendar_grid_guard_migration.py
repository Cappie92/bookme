"""Migration 20261114: refuse dirty legacy, idempotent on clean schema."""

from __future__ import annotations

import importlib.util
import sqlite3
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

import models  # noqa: F401
from database import Base, install_sqlite_calendar_guard_hooks
from utils.sqlite_calendar_grid_guard import register_sqlite_calendar_guard_udfs

MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "20261114_calendar_grid_sqlite_guard.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("calendar_grid_guard_mig", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_upgrade(db_path: Path):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    engine = create_engine(f"sqlite:///{db_path}")
    mig = _load_migration()
    with engine.begin() as conn:
        with Operations.context(MigrationContext.configure(conn)):
            mig.upgrade()
    engine.dispose()


@pytest.fixture()
def clean_db(tmp_path):
    path = tmp_path / "mig.sqlite"
    engine = create_engine(f"sqlite:///{path}")
    install_sqlite_calendar_guard_hooks(engine)
    Base.metadata.create_all(bind=engine)
    with engine.begin() as sa_conn:
        sa_conn.execute(
            text(
                "INSERT INTO bookings (id, start_time, end_time, public_reference) "
                "VALUES (1, '2026-11-11 10:00:00', '2026-11-11 10:30:00', 'mig-ok-1')"
            )
        )
    engine.dispose()
    return path


def test_migration_refuses_dirty_off_grid_booking(tmp_path):
    path = tmp_path / "dirty.sqlite"
    engine = create_engine(f"sqlite:///{path}")
    install_sqlite_calendar_guard_hooks(engine)
    Base.metadata.create_all(bind=engine)
    engine.dispose()
    conn = sqlite3.connect(path)
    register_sqlite_calendar_guard_udfs(conn)
    for name in (
        "bookings_calendar_guard_insert",
        "bookings_calendar_guard_update",
        "calendar_blocks_guard_insert",
        "calendar_blocks_guard_update",
    ):
        conn.execute(f"DROP TRIGGER IF EXISTS {name}")
    conn.execute(
        "INSERT INTO bookings (id, start_time, end_time, public_reference) "
        "VALUES (1, '2026-11-11 19:11:00', '2026-11-11 19:41:00', 'mig-bad')"
    )
    conn.commit()
    conn.close()
    with pytest.raises(RuntimeError, match="Refusing calendar grid guard migration"):
        _run_upgrade(path)


def test_migration_on_clean_legacy_row_is_no_write(clean_db):
    path = clean_db
    conn = sqlite3.connect(path)
    before = conn.execute(
        "SELECT start_time, end_time, start_utc_us FROM bookings WHERE id=1"
    ).fetchone()
    conn.close()
    _run_upgrade(path)
    conn = sqlite3.connect(path)
    after = conn.execute(
        "SELECT start_time, end_time, start_utc_us FROM bookings WHERE id=1"
    ).fetchone()
    assert before == after
    triggers = {
        r[0]
        for r in conn.execute("SELECT name FROM sqlite_master WHERE type='trigger'").fetchall()
    }
    assert "bookings_calendar_guard_insert" in triggers
    assert "calendar_blocks_guard_insert" in triggers
    _run_upgrade(path)
    conn.close()