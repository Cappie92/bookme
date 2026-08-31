"""set canonical Free active future booking limit to 20

Revision ID: 20260830_free_booking_limit
Revises: 20260812_session_version
Create Date: 2026-08-30
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260830_free_booking_limit"
down_revision = "20260812_session_version"
branch_labels = None
depends_on = None


plans = sa.table(
    "subscription_plans",
    sa.column("id", sa.Integer()),
    sa.column("name", sa.String()),
    sa.column("subscription_type", sa.String()),
    sa.column("limits", sa.JSON()),
)


def _replace_limit(expected: int | None, replacement: int) -> None:
    bind = op.get_bind()
    if "subscription_plans" not in sa.inspect(bind).get_table_names():
        return
    rows = bind.execute(
        sa.select(plans.c.id, plans.c.limits).where(
            plans.c.name == "Free",
            plans.c.subscription_type.in_(("MASTER", "master")),
        )
    ).mappings()
    for row in rows:
        limits = dict(row["limits"] or {})
        current = limits.get("max_future_bookings")
        if expected is not None and current != expected:
            continue
        limits["max_future_bookings"] = replacement
        bind.execute(
            plans.update().where(plans.c.id == row["id"]).values(limits=limits)
        )


def upgrade() -> None:
    _replace_limit(expected=None, replacement=20)


def downgrade() -> None:
    _replace_limit(expected=20, replacement=30)
