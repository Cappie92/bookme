"""calendar B3: optional guest name on bookings

Additive only. Existing rows stay NULL. No backfill of legacy history.

Revision ID: 20261030_calendar_b3
Revises: 20261028_calendar_b22
Create Date: 2026-10-30
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20261030_calendar_b3"
down_revision = "20261028_calendar_b22"
branch_labels = None
depends_on = None


def _has_column(bind, table: str, name: str) -> bool:
    if table not in set(sa.inspect(bind).get_table_names()):
        return False
    return name in {column["name"] for column in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "bookings", "guest_name"):
        op.add_column("bookings", sa.Column("guest_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "bookings", "guest_name"):
        op.drop_column("bookings", "guest_name")
