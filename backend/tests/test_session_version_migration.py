import os
import sqlite3
import subprocess
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


def _alembic(database_url: str, *args: str) -> None:
    env = {**os.environ, "DATABASE_URL": database_url}
    subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def _columns(connection: sqlite3.Connection) -> set[str]:
    return {row[1] for row in connection.execute("PRAGMA table_info(users)")}


def test_session_version_migration_backfills_existing_user_and_downgrades(tmp_path):
    database_path = tmp_path / "session-version-migration.db"
    database_url = f"sqlite:///{database_path}"
    connection = sqlite3.connect(database_path)
    connection.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR)")
    connection.execute("INSERT INTO users (id, email) VALUES (1, 'existing@example.com')")
    connection.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)")
    connection.execute(
        "INSERT INTO alembic_version (version_num) VALUES ('20260809_apple_iap_fields')"
    )
    connection.commit()
    connection.close()

    _alembic(database_url, "upgrade", "head")
    connection = sqlite3.connect(database_path)
    assert "session_version" in _columns(connection)
    assert connection.execute(
        "SELECT session_version FROM users WHERE id = 1"
    ).fetchone() == (1,)
    connection.close()

    _alembic(database_url, "downgrade", "20260809_apple_iap_fields")
    connection = sqlite3.connect(database_path)
    assert "session_version" not in _columns(connection)
    connection.close()
