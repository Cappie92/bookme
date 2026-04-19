"""add snapshot credit and apply fields

Revision ID: 20260119_add_snapshot_credit_and_apply_fields
Revises: 20260118_add_payment_subscription_apply_status
Create Date: 2026-01-19
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "20260119_add_snapshot_credit_and_apply_fields"
down_revision = "20260118_add_payment_subscription_apply_status"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "subscription_price_snapshots" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("subscription_price_snapshots")}

    if "credit_amount" not in cols:
        op.add_column(
            "subscription_price_snapshots",
            sa.Column("credit_amount", sa.Float(), nullable=False, server_default="0"),
        )
    if "is_downgrade" not in cols:
        op.add_column(
            "subscription_price_snapshots",
            sa.Column("is_downgrade", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        )
    if "forced_upgrade_type" not in cols:
        op.add_column(
            "subscription_price_snapshots",
            sa.Column("forced_upgrade_type", sa.String(), nullable=True),
        )
    if "applied_subscription_id" not in cols:
        op.add_column(
            "subscription_price_snapshots",
            sa.Column("applied_subscription_id", sa.Integer(), nullable=True),
        )
    if "applied_at" not in cols:
        op.add_column(
            "subscription_price_snapshots",
            sa.Column("applied_at", sa.DateTime(), nullable=True),
        )

    conn = op.get_bind()
    if conn.dialect.name != "sqlite":
        op.alter_column("subscription_price_snapshots", "credit_amount", server_default=None)
        op.alter_column("subscription_price_snapshots", "is_downgrade", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    if "subscription_price_snapshots" not in sa.inspect(bind).get_table_names():
        return
    cols = {c["name"] for c in sa.inspect(bind).get_columns("subscription_price_snapshots")}
    for col in ("applied_at", "applied_subscription_id", "forced_upgrade_type", "is_downgrade", "credit_amount"):
        if col in cols:
            op.drop_column("subscription_price_snapshots", col)
