"""calendar B2.2: proposed instant on booking edit requests

Additive only. Existing proposals keep NULL: their offset is unknown and is
not backfilled, so accepting them stays explicitly unresolved.

Revision ID: 20261028_calendar_b22
Revises: 20261027_calendar_b1
Create Date: 2026-10-28
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20261028_calendar_b22"
down_revision = "20261027_calendar_b1"
branch_labels = None
depends_on = None


TABLE = "booking_edit_requests"


def _columns() -> list[sa.Column]:
    return [
        sa.Column("proposed_start_utc_us", sa.BigInteger(), nullable=True),
        sa.Column("proposed_end_utc_us", sa.BigInteger(), nullable=True),
        sa.Column("proposed_time_zone", sa.String(length=64), nullable=True),
    ]


def _existing(bind) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(TABLE)}


def upgrade() -> None:
    bind = op.get_bind()
    if TABLE not in set(sa.inspect(bind).get_table_names()):
        raise RuntimeError(f"Required table does not exist: {TABLE}")
    existing = _existing(bind)
    for column in _columns():
        if column.name not in existing:
            op.add_column(TABLE, column)


def downgrade() -> None:
    # Native DROP COLUMN only (SQLite >= 3.35), as in 20261027_calendar_b1.
    bind = op.get_bind()
    existing = _existing(bind)
    for column in _columns():
        if column.name in existing:
            op.drop_column(TABLE, column.name)
