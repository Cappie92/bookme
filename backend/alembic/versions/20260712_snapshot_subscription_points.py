"""add subscription points fields to price snapshots

Revision ID: 20260712_snapshot_subscription_points
Revises: 20260711_payment_source
Create Date: 2026-07-12

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260712_snapshot_subscription_points"
down_revision: Union[str, None] = "20260711_payment_source"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "subscription_price_snapshots" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("subscription_price_snapshots")}

    if "price_before_points" not in cols:
        op.add_column(
            "subscription_price_snapshots",
            sa.Column("price_before_points", sa.Float(), nullable=True),
        )
    if "subscription_points_used" not in cols:
        op.add_column(
            "subscription_price_snapshots",
            sa.Column("subscription_points_used", sa.Integer(), nullable=False, server_default="0"),
        )
    if "subscription_points_debit_ledger_id" not in cols:
        op.add_column(
            "subscription_price_snapshots",
            sa.Column("subscription_points_debit_ledger_id", sa.Integer(), nullable=True),
        )

    if "price_before_points" in cols or "price_before_points" not in cols:
        op.execute(
            sa.text(
                "UPDATE subscription_price_snapshots "
                "SET price_before_points = final_price "
                "WHERE price_before_points IS NULL"
            )
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "subscription_price_snapshots" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("subscription_price_snapshots")}
    if "subscription_points_debit_ledger_id" in cols:
        op.drop_column("subscription_price_snapshots", "subscription_points_debit_ledger_id")
    if "subscription_points_used" in cols:
        op.drop_column("subscription_price_snapshots", "subscription_points_used")
    if "price_before_points" in cols:
        op.drop_column("subscription_price_snapshots", "price_before_points")
