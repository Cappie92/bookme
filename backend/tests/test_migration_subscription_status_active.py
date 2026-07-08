"""Regression test: subscriptions.status 'active' -> 'ACTIVE'."""
import importlib.util
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text

BACKEND_DIR = Path(__file__).resolve().parents[1]
MIGRATION_PATH = (
    BACKEND_DIR / "alembic" / "versions" / "20260709_fix_subscription_status_active_case.py"
)


def _load_migration_module():
    spec = importlib.util.spec_from_file_location(
        "subscription_status_active_migration", MIGRATION_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _run_migration(conn, direction: str) -> None:
    migration = _load_migration_module()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        if direction == "upgrade":
            migration.upgrade()
        else:
            migration.downgrade()


def test_subscription_status_active_migrated_to_ACTIVE():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(
            text("CREATE TABLE subscriptions (id INTEGER PRIMARY KEY, status TEXT)")
        )
        conn.execute(text("INSERT INTO subscriptions (id, status) VALUES (1, 'active')"))
        conn.execute(text("INSERT INTO subscriptions (id, status) VALUES (2, 'ACTIVE')"))

    with engine.begin() as conn:
        _run_migration(conn, "upgrade")

    with engine.connect() as conn:
        assert conn.execute(text("SELECT status FROM subscriptions WHERE id=1")).scalar() == "ACTIVE"
        assert conn.execute(text("SELECT status FROM subscriptions WHERE id=2")).scalar() == "ACTIVE"

    with engine.begin() as conn:
        _run_migration(conn, "upgrade")

    with engine.connect() as conn:
        assert conn.execute(text("SELECT status FROM subscriptions WHERE id=1")).scalar() == "ACTIVE"
