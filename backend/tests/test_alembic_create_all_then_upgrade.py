import importlib.util
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import sqlalchemy as sa
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text


BACKEND_DIR = Path(__file__).resolve().parents[1]
VERSIONS_DIR = BACKEND_DIR / "alembic" / "versions"

CONTACT_COLUMNS = {
    "phone_verification_call_id",
    "phone_verification_attempts",
    "phone_verification_target_phone",
    "phone_verification_purpose",
    "pending_phone",
    "pending_phone_expires_at",
    "pending_email",
}
EMAIL_VERIFICATION_COLUMNS = {"purpose", "email_to_verify"}
ACCOUNT_DELETION_USER_COLUMNS = {"deleted_at"}
ACCOUNT_DELETION_MASTER_COLUMNS = {"is_deleted", "deleted_at"}
APPLE_USER_COLUMNS = {"revenuecat_app_user_id"}
APPLE_SUBSCRIPTION_COLUMNS = {
    "billing_provider",
    "apple_original_transaction_id",
    "apple_transaction_id",
    "apple_product_id",
    "apple_environment",
}
APPLE_USER_INDEXES = {"ix_users_revenuecat_app_user_id"}
APPLE_SUBSCRIPTION_INDEXES = {
    "ix_subscriptions_apple_original_transaction_id",
    "ix_subscriptions_apple_product_id",
}


def _load_migration(filename: str):
    path = VERSIONS_DIR / filename
    module_name = f"test_{path.stem}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _upgrade(conn, filename: str) -> None:
    migration = _load_migration(filename)
    context = MigrationContext.configure(conn)
    with Operations.context(context):
        migration.upgrade()


def _columns(bind, table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(table_name)}


def _indexes(bind, table_name: str) -> set[str]:
    return {index["name"] for index in sa.inspect(bind).get_indexes(table_name)}


def _run_backend(database_url: str, *args: str) -> subprocess.CompletedProcess[str]:
    env = {**os.environ, "DATABASE_URL": database_url, "PYTHONDONTWRITEBYTECODE": "1"}
    return subprocess.run(
        [sys.executable, *args],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def test_create_all_then_alembic_upgrade_head(tmp_path):
    database_path = tmp_path / "create-all-then-upgrade.db"
    database_url = f"sqlite:///{database_path}"

    _run_backend(
        database_url,
        "-c",
        "from database import Base, engine; import models; "
        "Base.metadata.create_all(bind=engine)",
    )

    engine = create_engine(database_url)
    assert CONTACT_COLUMNS <= _columns(engine, "users")
    assert EMAIL_VERIFICATION_COLUMNS <= _columns(engine, "email_verifications")
    assert ACCOUNT_DELETION_USER_COLUMNS <= _columns(engine, "users")
    assert ACCOUNT_DELETION_MASTER_COLUMNS <= _columns(engine, "masters")
    assert APPLE_USER_COLUMNS <= _columns(engine, "users")
    assert APPLE_SUBSCRIPTION_COLUMNS <= _columns(engine, "subscriptions")
    assert APPLE_USER_INDEXES <= _indexes(engine, "users")
    assert APPLE_SUBSCRIPTION_INDEXES <= _indexes(engine, "subscriptions")
    assert "session_version" in _columns(engine, "users")
    engine.dispose()

    _run_backend(database_url, "-m", "alembic", "upgrade", "head")

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    expected_heads = set(ScriptDirectory.from_config(config).get_heads())
    connection = sqlite3.connect(database_path)
    actual_heads = {
        row[0] for row in connection.execute("SELECT version_num FROM alembic_version")
    }
    connection.close()
    assert actual_heads == expected_heads

    engine = create_engine(database_url)
    assert CONTACT_COLUMNS <= _columns(engine, "users")
    assert EMAIL_VERIFICATION_COLUMNS <= _columns(engine, "email_verifications")
    assert ACCOUNT_DELETION_USER_COLUMNS <= _columns(engine, "users")
    assert ACCOUNT_DELETION_MASTER_COLUMNS <= _columns(engine, "masters")
    assert APPLE_USER_COLUMNS <= _columns(engine, "users")
    assert APPLE_SUBSCRIPTION_COLUMNS <= _columns(engine, "subscriptions")
    assert APPLE_USER_INDEXES <= _indexes(engine, "users")
    assert APPLE_SUBSCRIPTION_INDEXES <= _indexes(engine, "subscriptions")
    assert "session_version" in _columns(engine, "users")
    engine.dispose()


def test_pending_contact_migration_adds_missing_and_skips_existing():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE users ("
                "id INTEGER PRIMARY KEY, phone_verification_call_id VARCHAR)"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE email_verifications ("
                "id INTEGER PRIMARY KEY, purpose VARCHAR NOT NULL)"
            )
        )
        _upgrade(conn, "838e2b24a042_add_pending_contact_verification.py")
        _upgrade(conn, "838e2b24a042_add_pending_contact_verification.py")

    assert CONTACT_COLUMNS <= _columns(engine, "users")
    assert EMAIL_VERIFICATION_COLUMNS <= _columns(engine, "email_verifications")


def test_account_deletion_migration_adds_missing_and_skips_existing():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, deleted_at DATETIME)"))
        conn.execute(text("CREATE TABLE masters (id INTEGER PRIMARY KEY)"))
        _upgrade(conn, "20260721_account_deletion_fields.py")
        _upgrade(conn, "20260721_account_deletion_fields.py")

    assert ACCOUNT_DELETION_USER_COLUMNS <= _columns(engine, "users")
    assert ACCOUNT_DELETION_MASTER_COLUMNS <= _columns(engine, "masters")


def test_apple_iap_migration_adds_missing_columns_and_indexes_and_skips_existing():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE users ("
                "id INTEGER PRIMARY KEY, revenuecat_app_user_id VARCHAR(36))"
            )
        )
        conn.execute(
            text(
                "CREATE TABLE subscriptions ("
                "id INTEGER PRIMARY KEY, billing_provider VARCHAR(32) NOT NULL, "
                "apple_original_transaction_id VARCHAR(128))"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX ix_subscriptions_apple_original_transaction_id "
                "ON subscriptions (apple_original_transaction_id)"
            )
        )
        _upgrade(conn, "20260809_apple_iap_subscription_fields.py")
        _upgrade(conn, "20260809_apple_iap_subscription_fields.py")

    assert APPLE_USER_COLUMNS <= _columns(engine, "users")
    assert APPLE_SUBSCRIPTION_COLUMNS <= _columns(engine, "subscriptions")
    assert APPLE_USER_INDEXES <= _indexes(engine, "users")
    assert APPLE_SUBSCRIPTION_INDEXES <= _indexes(engine, "subscriptions")


def test_session_version_migration_adds_missing_and_skips_existing():
    missing_engine = create_engine("sqlite:///:memory:")
    with missing_engine.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        _upgrade(conn, "20260812_user_session_version.py")
        _upgrade(conn, "20260812_user_session_version.py")
    assert "session_version" in _columns(missing_engine, "users")

    existing_engine = create_engine("sqlite:///:memory:")
    with existing_engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE users ("
                "id INTEGER PRIMARY KEY, session_version INTEGER NOT NULL DEFAULT 1)"
            )
        )
        _upgrade(conn, "20260812_user_session_version.py")
    assert "session_version" in _columns(existing_engine, "users")
