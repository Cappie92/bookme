"""add_payment_subscription_apply_status

Revision ID: 20260118_add_payment_subscription_apply_status
Revises: 383f4e3e8235
Create Date: 2026-01-18

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260118_add_payment_subscription_apply_status"
down_revision: Union[str, None] = "383f4e3e8235"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if "payments" not in tables:
        return

    cols = {c["name"] for c in inspector.get_columns("payments")}

    if "subscription_apply_status" not in cols:
        op.add_column(
            "payments",
            sa.Column("subscription_apply_status", sa.String(), nullable=False, server_default="pending"),
        )
        op.create_index(
            "ix_payments_subscription_apply_status",
            "payments",
            ["subscription_apply_status"],
            unique=False,
        )
        # SQLite doesn't support ALTER COLUMN DROP DEFAULT
        if conn.dialect.name != "sqlite":
            op.alter_column("payments", "subscription_apply_status", server_default=None)

    if "subscription_applied_at" not in cols:
        op.add_column("payments", sa.Column("subscription_applied_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()
    if "payments" not in tables:
        return

    cols = {c["name"] for c in inspector.get_columns("payments")}

    if "subscription_applied_at" in cols:
        op.drop_column("payments", "subscription_applied_at")

    if "subscription_apply_status" in cols:
        try:
            op.drop_index("ix_payments_subscription_apply_status", table_name="payments")
        except Exception:
            pass
        op.drop_column("payments", "subscription_apply_status")

