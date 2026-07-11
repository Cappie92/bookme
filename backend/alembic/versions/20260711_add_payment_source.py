"""add payment_source to payments

Revision ID: 20260711_payment_source
Revises: 20260709_subscription_status_active
Create Date: 2026-07-11

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260711_payment_source"
down_revision: Union[str, None] = "20260709_subscription_status_active"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "payments" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("payments")}
    if "payment_source" in cols:
        return
    op.add_column(
        "payments",
        sa.Column("payment_source", sa.String(), nullable=False, server_default="web"),
    )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    if "payments" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("payments")}
    if "payment_source" not in cols:
        return
    op.drop_column("payments", "payment_source")
