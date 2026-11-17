"""SQLite calendar interval guards (UDF triggers).

Revision ID: 20261114_calendar_grid_guard
Revises: 20261031_b3_master_svc
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "20261114_calendar_grid_guard"
down_revision: Union[str, None] = "20261031_b3_master_svc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _dbapi_connection():
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        raise RuntimeError("20261114_calendar_grid_guard applies to SQLite only")
    return bind.connection.dbapi_connection


def _table_columns(conn, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def upgrade() -> None:
    conn = _dbapi_connection()
    from utils.sqlite_calendar_grid_guard import (
        apply_sqlite_calendar_grid_guards,
        iter_invalid_booking_rows,
        iter_invalid_calendar_block_rows,
        register_sqlite_calendar_guard_udfs,
    )

    register_sqlite_calendar_guard_udfs(conn)
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    booking_cols = _table_columns(conn, "bookings") if "bookings" in tables else set()
    only: set[str] = set()
    bad: list[tuple[int, str]] = []
    if "bookings" in tables and {"start_time", "end_time"}.issubset(booking_cols):
        only.add("bookings")
        bad.extend(iter_invalid_booking_rows(conn))
    if "calendar_blocks" in tables:
        only.add("calendar_blocks")
        bad.extend(iter_invalid_calendar_block_rows(conn))
    if bad:
        sample = ", ".join(f"{kind}#{rid}" for rid, kind in bad[:20])
        extra = f" (+{len(bad) - 20} more)" if len(bad) > 20 else ""
        raise RuntimeError(
            "Refusing calendar grid guard migration: off-grid or inconsistent rows "
            f"still present ({len(bad)}): {sample}{extra}. "
            "Repair only verified synthetic fixtures before retry."
        )
    if only:
        apply_sqlite_calendar_grid_guards(conn, only_tables=only)


def downgrade() -> None:
    conn = _dbapi_connection()
    for name in (
        "bookings_calendar_guard_insert",
        "bookings_calendar_guard_update",
        "calendar_blocks_guard_insert",
        "calendar_blocks_guard_update",
        "bookings_enforce_grid_insert",
        "bookings_enforce_grid_update",
    ):
        conn.execute(f"DROP TRIGGER IF EXISTS {name}")