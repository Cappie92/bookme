import sqlite3

import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine, text

import test_calendar_b1_migration as b1


B1_HEAD = b1.HEAD
HEAD = "20261028_calendar_b22"
MIGRATION = b1.BACKEND_DIR / "alembic" / "versions" / "20261028_calendar_b22_edit_request_time.py"
PROPOSAL_COLUMNS = b1.LATER_COLUMNS["booking_edit_requests"]
LEGACY_PROPOSAL = {
    "id": 1,
    "booking_id": 2,
    "proposed_start": "2026-11-02 12:00:00.000000",
    "proposed_end": "2026-11-02 13:00:00.000000",
    "status": "PENDING",
}


def _snapshot(path):
    with sqlite3.connect(path) as conn:
        return {
            "proposals": b1._select(
                conn, "id, booking_id, proposed_start, proposed_end, status", "booking_edit_requests"
            ),
            "bookings": b1._select(conn, b1.BOOKING_COLUMNS, "bookings"),
            "proposal_shape": b1._shape(conn, "booking_edit_requests"),
        }


@pytest.fixture
def legacy_db(tmp_path):
    path = tmp_path / "legacy.sqlite"
    engine = create_engine(f"sqlite:///{path}")
    b1._legacy_metadata().create_all(engine)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)"))
        conn.execute(text("INSERT INTO alembic_version VALUES (:rev)"), {"rev": b1.PREVIOUS})
        for table, values in [*b1.LEGACY_ROWS, ("booking_edit_requests", LEGACY_PROPOSAL)]:
            names = ", ".join(values)
            params = ", ".join(f":{name}" for name in values)
            conn.execute(text(f"INSERT INTO {table} ({names}) VALUES ({params})"), values)
    engine.dispose()
    return path


def test_b22_upgrade_keeps_existing_proposals_unresolved_and_downgrades_cleanly(legacy_db):
    url = f"sqlite:///{legacy_db}"
    b1._alembic(url, "upgrade", B1_HEAD)
    before = _snapshot(legacy_db)

    b1._alembic(url, "upgrade", "head")
    after = _snapshot(legacy_db)
    assert after["proposals"] == before["proposals"]
    assert after["bookings"] == before["bookings"]
    with sqlite3.connect(legacy_db) as conn:
        assert b1._rows(conn, "SELECT version_num FROM alembic_version") == [(HEAD,)]
        assert b1._select(conn, ", ".join(PROPOSAL_COLUMNS), "booking_edit_requests") == [(None, None, None)]

    b1._alembic(url, "downgrade", B1_HEAD)
    assert _snapshot(legacy_db) == before

    b1._alembic(url, "upgrade", "head")
    assert _snapshot(legacy_db)["proposals"] == before["proposals"]


def _load_migration():
    import importlib.util

    spec = importlib.util.spec_from_file_location("calendar_b22_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(conn, function_name):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    with Operations.context(MigrationContext.configure(conn)):
        getattr(_load_migration(), function_name)()


def test_b22_upgrade_is_idempotent_and_completes_partial_state(legacy_db):
    engine = create_engine(f"sqlite:///{legacy_db}")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE booking_edit_requests ADD COLUMN proposed_time_zone VARCHAR(64)"))
        _run(conn, "upgrade")
        _run(conn, "upgrade")
    columns = {column["name"] for column in sa.inspect(engine).get_columns("booking_edit_requests")}
    assert set(PROPOSAL_COLUMNS) <= columns
    engine.dispose()


def test_b22_upgrade_refuses_schema_without_edit_requests():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        with pytest.raises(RuntimeError):
            _run(conn, "upgrade")
