import importlib.util
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import Index, MetaData, Table, create_engine, text

from models import Base


BACKEND_DIR = Path(__file__).resolve().parents[1]
MIGRATION = BACKEND_DIR / "alembic" / "versions" / "20261027_calendar_b1_data_model.py"
PREVIOUS = "20260914_push_notifications_v1"
HEAD = "20261027_calendar_b1"
NEW_TABLES = {"calendar_blocks", "idempotency_receipts"}
NEW_COLUMNS = {
    "bookings": [
        "master_client_metadata_id",
        "source",
        "created_by_user_id",
        "start_utc_us",
        "end_utc_us",
        "time_zone",
        "version",
    ],
    "temporary_bookings": ["start_utc_us", "end_utc_us", "time_zone"],
}
BOOKING_COLUMNS = (
    "id, client_id, master_id, start_time, end_time, status, public_reference"
)
HOLD_COLUMNS = "id, start_time, end_time, expires_at, status"
LEGACY_ROWS = [
    ("users", {"id": 1, "phone": "+70000000501", "role": "MASTER"}),
    ("users", {"id": 2, "phone": "+70000000502", "role": "CLIENT"}),
    (
        "masters",
        {
            "id": 1,
            "user_id": 1,
            "timezone": "Europe/Moscow",
            "timezone_confirmed": 1,
            "is_deleted": 0,
        },
    ),
    ("services", {"id": 1, "name": "Synthetic"}),
    (
        "master_client_metadata",
        {"id": 1, "master_id": 1, "client_phone": "+70000000502"},
    ),
    (
        "bookings",
        {
            "id": 1,
            "client_id": 2,
            "master_id": 1,
            "service_id": 1,
            # A wall time inside the 2025 EU DST gap must survive byte-for-byte.
            "start_time": "2025-03-30 02:30:00.000000",
            "end_time": "2025-03-30 03:30:00.000000",
            "status": "completed",
            "public_reference": "LEGACY0001",
        },
    ),
    (
        "bookings",
        {
            "id": 2,
            "client_id": 2,
            "master_id": 1,
            "service_id": 1,
            "start_time": "2026-11-02 10:00:00.000000",
            "end_time": "2026-11-02 11:00:00.000000",
            "status": "cancelled",
            "public_reference": "LEGACY0002",
        },
    ),
    (
        "temporary_bookings",
        {
            "id": 1,
            "master_id": 1,
            "client_id": 2,
            "service_id": 1,
            "start_time": "2026-11-02 12:00:00.000000",
            "end_time": "2026-11-02 13:00:00.000000",
            "payment_amount": 100.0,
            "expires_at": "2026-11-01 09:20:00.000000",
            "status": "pending",
        },
    ),
]


def _legacy_metadata() -> MetaData:
    """Current schema minus everything B1 adds, i.e. the pre-B1 production shape."""

    legacy = MetaData()
    for table in Base.metadata.sorted_tables:
        if table.name in NEW_TABLES:
            continue
        dropped = set(NEW_COLUMNS.get(table.name, ()))
        if not dropped:
            table.to_metadata(legacy)
            continue
        columns = []
        for column in table.columns:
            if column.name in dropped:
                continue
            copy = column._copy()
            copy.index = False
            copy.unique = False
            columns.append(copy)
        legacy_table = Table(table.name, legacy, *columns)
        for index in table.indexes:
            names = [column.name for column in index.columns]
            if not set(names) & dropped:
                Index(
                    index.name,
                    *[legacy_table.c[name] for name in names],
                    unique=index.unique,
                )
    return legacy


def _alembic(database_url, *args):
    env = {**os.environ, "DATABASE_URL": database_url, "PYTHONDONTWRITEBYTECODE": "1"}
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def _rows(connection, sql):
    return [tuple(row) for row in connection.execute(sql)]


def _select(connection, columns, table):
    return _rows(connection, f"SELECT {columns} FROM {table} ORDER BY id")


def _tables(connection):
    return {row[0] for row in _rows(connection, "SELECT name FROM sqlite_master")}


def _shape(connection, table):
    columns = _rows(connection, f"PRAGMA table_info({table})")
    indexes = sorted(
        (
            name,
            unique,
            tuple(
                info[2] for info in _rows(connection, f"PRAGMA index_info('{name}')")
            ),
        )
        for _, name, unique, *_ in _rows(connection, f"PRAGMA index_list({table})")
    )
    return columns, indexes


def _snapshot(path):
    with sqlite3.connect(path) as conn:
        return {
            "bookings": _select(conn, BOOKING_COLUMNS, "bookings"),
            "holds": _select(conn, HOLD_COLUMNS, "temporary_bookings"),
            "users": _select(conn, "id, phone, role", "users"),
            "booking_shape": _shape(conn, "bookings"),
            "hold_shape": _shape(conn, "temporary_bookings"),
        }


@pytest.fixture
def legacy_db(tmp_path):
    path = tmp_path / "legacy.sqlite"
    engine = create_engine(f"sqlite:///{path}")
    _legacy_metadata().create_all(engine)
    with engine.begin() as conn:
        conn.execute(
            text("CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)")
        )
        conn.execute(
            text("INSERT INTO alembic_version VALUES (:rev)"), {"rev": PREVIOUS}
        )
        for table, values in LEGACY_ROWS:
            names = ", ".join(values)
            params = ", ".join(f":{name}" for name in values)
            conn.execute(
                text(f"INSERT INTO {table} ({names}) VALUES ({params})"), values
            )
    engine.dispose()
    return path


def test_upgrade_preserves_legacy_rows_and_leaves_metadata_unknown(legacy_db):
    url = f"sqlite:///{legacy_db}"
    before = _snapshot(legacy_db)

    _alembic(url, "upgrade", "head")

    after = _snapshot(legacy_db)
    assert {key: after[key] for key in ("bookings", "holds", "users")} == {
        key: before[key] for key in ("bookings", "holds", "users")
    }
    with sqlite3.connect(legacy_db) as conn:
        assert _rows(conn, "SELECT version_num FROM alembic_version") == [(HEAD,)]
        booking_metadata = _select(conn, ", ".join(NEW_COLUMNS["bookings"]), "bookings")
        assert booking_metadata == [(None, None, None, None, None, None, 1)] * 2
        hold_metadata = _select(
            conn, ", ".join(NEW_COLUMNS["temporary_bookings"]), "temporary_bookings"
        )
        assert hold_metadata == [(None, None, None)]
        assert NEW_TABLES <= _tables(conn)
        index_names = {index[0] for index in _shape(conn, "bookings")[1]}
        assert "ix_bookings_master_client_metadata_id" in index_names

    _alembic(url, "downgrade", PREVIOUS)

    assert _snapshot(legacy_db) == before
    with sqlite3.connect(legacy_db) as conn:
        assert _rows(conn, "SELECT version_num FROM alembic_version") == [(PREVIOUS,)]
        assert not NEW_TABLES & _tables(conn)

    _alembic(url, "upgrade", "head")
    with sqlite3.connect(legacy_db) as conn:
        assert _select(conn, BOOKING_COLUMNS, "bookings") == before["bookings"]
        assert _rows(conn, "SELECT DISTINCT version FROM bookings") == [(1,)]


def _load_migration():
    spec = importlib.util.spec_from_file_location("calendar_b1_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(conn, function_name):
    context = MigrationContext.configure(conn)
    with Operations.context(context):
        getattr(_load_migration(), function_name)()


def test_upgrade_is_idempotent_and_completes_partial_state(legacy_db):
    engine = create_engine(f"sqlite:///{legacy_db}")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE bookings ADD COLUMN source VARCHAR(32)"))
        conn.execute(text("UPDATE bookings SET source = 'online' WHERE id = 1"))
        _run(conn, "upgrade")
        _run(conn, "upgrade")

    inspector = sa.inspect(engine)
    booking_columns = {column["name"] for column in inspector.get_columns("bookings")}
    assert set(NEW_COLUMNS["bookings"]) <= booking_columns
    assert NEW_TABLES <= set(inspector.get_table_names())
    with engine.connect() as conn:
        sources = conn.execute(text("SELECT source FROM bookings ORDER BY id"))
        assert sources.scalars().all() == ["online", None]
    engine.dispose()


def test_upgrade_refuses_schema_without_required_tables():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        with pytest.raises(RuntimeError):
            _run(conn, "upgrade")
