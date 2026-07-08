"""Регрессионные тесты миграции payments.public_id."""
import importlib.util
import os
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text

BACKEND_DIR = Path(__file__).resolve().parents[1]
MIGRATION_PATH = BACKEND_DIR / "alembic" / "versions" / "20260708_add_payment_public_id.py"


def _load_migration_module():
    spec = importlib.util.spec_from_file_location("payment_public_id_migration", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _create_pre_migration_payments_table(conn) -> None:
    conn.execute(
        text(
            """
            CREATE TABLE payments (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                amount REAL NOT NULL,
                status TEXT NOT NULL,
                payment_type TEXT NOT NULL,
                robokassa_invoice_id TEXT NOT NULL UNIQUE,
                subscription_apply_status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
    )
    for i in range(4):
        conn.execute(
            text(
                "INSERT INTO payments "
                "(user_id, amount, status, payment_type, robokassa_invoice_id, subscription_apply_status, created_at, updated_at) "
                "VALUES (1, :amount, 'pending', 'subscription', :inv, 'pending', datetime('now'), datetime('now'))"
            ),
            {"amount": 100.0 + i, "inv": f"MIG-INV-{i}"},
        )


def _run_migration(conn, direction: str) -> None:
    migration = _load_migration_module()
    ctx = MigrationContext.configure(conn)
    with Operations.context(ctx):
        if direction == "upgrade":
            migration.upgrade()
        else:
            migration.downgrade()


def test_backfill_payment_public_ids_assigns_unique_values():
    from utils.payment_public_id import backfill_payment_public_ids

    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE payments ("
                "id INTEGER PRIMARY KEY, "
                "public_id TEXT, "
                "amount REAL)"
            )
        )
        for i in range(5):
            conn.execute(text("INSERT INTO payments (amount) VALUES (:a)"), {"a": float(i)})

    with engine.begin() as conn:
        updated = backfill_payment_public_ids(conn)
        assert updated == 5

    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, public_id FROM payments ORDER BY id")).fetchall()
        assert len(rows) == 5
        public_ids = [r[1] for r in rows]
        assert all(public_ids)
        assert len(set(public_ids)) == 5

        updated_again = backfill_payment_public_ids(conn)
        assert updated_again == 0


def test_backfill_payment_public_ids_order_independent():
    from utils.payment_public_id import backfill_payment_public_ids

    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE payments (id INTEGER PRIMARY KEY, public_id TEXT, amount REAL)"
            )
        )
        conn.execute(text("INSERT INTO payments (id, amount) VALUES (10, 1), (5, 2), (7, 3)"))

    with engine.begin() as conn:
        backfill_payment_public_ids(conn)

    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, public_id FROM payments ORDER BY id")
        ).fetchall()
        assert all(r[1] for r in rows)
        assert len({r[1] for r in rows}) == 3


def test_payment_public_id_migration_upgrade_downgrade_sqlite():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        _create_pre_migration_payments_table(conn)

    with engine.begin() as conn:
        _run_migration(conn, "upgrade")

    with engine.connect() as conn:
        cols = {c["name"] for c in sa.inspect(engine).get_columns("payments")}
        assert "public_id" in cols

        nulls = conn.execute(
            text("SELECT COUNT(*) FROM payments WHERE public_id IS NULL OR public_id = ''")
        ).scalar()
        assert nulls == 0

        total = conn.execute(text("SELECT COUNT(*) FROM payments")).scalar()
        distinct = conn.execute(text("SELECT COUNT(DISTINCT public_id) FROM payments")).scalar()
        assert distinct == total

        indexes = {ix["name"] for ix in sa.inspect(engine).get_indexes("payments")}
        assert "ix_payments_public_id" in indexes

    # Повторный upgrade на уже заполненной таблице
    with engine.begin() as conn:
        _run_migration(conn, "upgrade")

    with engine.begin() as conn:
        _run_migration(conn, "downgrade")

    with engine.connect() as conn:
        cols = {c["name"] for c in sa.inspect(engine).get_columns("payments")}
        assert "public_id" not in cols
        indexes = {ix["name"] for ix in sa.inspect(engine).get_indexes("payments")}
        assert "ix_payments_public_id" not in indexes


def test_payment_public_id_migration_on_existing_production_like_db(tmp_path):
    """Проверка на file-based SQLite с уже существующими payments и public_id."""
    db_path = tmp_path / "prod_like.db"
    engine = create_engine(f"sqlite:///{db_path}")

    with engine.begin() as conn:
        _create_pre_migration_payments_table(conn)

    with engine.begin() as conn:
        _run_migration(conn, "upgrade")

    # Имитация production: колонка и индекс уже есть, часть строк заполнена
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE payments SET public_id = 'already-set-token' WHERE id = 1")
        )

    with engine.begin() as conn:
        _run_migration(conn, "upgrade")

    with engine.connect() as conn:
        nulls = conn.execute(
            text("SELECT COUNT(*) FROM payments WHERE public_id IS NULL OR public_id = ''")
        ).scalar()
        assert nulls == 0
        kept = conn.execute(
            text("SELECT public_id FROM payments WHERE id = 1")
        ).scalar()
        assert kept == "already-set-token"


@pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="PostgreSQL migration test requires TEST_DATABASE_URL=postgresql://...",
)
def test_payment_public_id_migration_upgrade_postgresql():
    from alembic import command
    from alembic.config import Config

    db_url = os.environ["TEST_DATABASE_URL"]
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", db_url)
    engine = create_engine(db_url)

    command.downgrade(cfg, "20260627_add_user_oauth_accounts")
    command.upgrade(cfg, "20260627_add_user_oauth_accounts")

    with engine.begin() as conn:
        uid = conn.execute(
            text(
                "INSERT INTO users (email, hashed_password, phone, full_name, role, is_active, is_verified) "
                "VALUES ('pgmig@test.com', 'hash', '+79009997766', 'PG Mig', 'master', true, true) "
                "RETURNING id"
            )
        ).scalar()
        for i in range(2):
            conn.execute(
                text(
                    "INSERT INTO payments "
                    "(user_id, amount, status, payment_type, robokassa_invoice_id, subscription_apply_status, created_at, updated_at) "
                    "VALUES (:uid, :amount, 'pending', 'subscription', :inv, 'pending', NOW(), NOW())"
                ),
                {"uid": uid, "amount": 200.0 + i, "inv": f"PG-MIG-{i}"},
            )

    command.upgrade(cfg, "20260708_payment_public_id")

    with engine.connect() as conn:
        nulls = conn.execute(
            text("SELECT COUNT(*) FROM payments WHERE public_id IS NULL OR public_id = ''")
        ).scalar()
        assert nulls == 0

        col = next(c for c in sa.inspect(engine).get_columns("payments") if c["name"] == "public_id")
        assert col["nullable"] is False

    command.downgrade(cfg, "20260627_add_user_oauth_accounts")
    with engine.connect() as conn:
        cols = {c["name"] for c in sa.inspect(engine).get_columns("payments")}
        assert "public_id" not in cols
