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
    # SubscriptionPriceSnapshot: credit fields + idempotency marker
    op.add_column(
        "subscription_price_snapshots",
        sa.Column("credit_amount", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "subscription_price_snapshots",
        sa.Column("is_downgrade", sa.Boolean(), nullable=False, server_default=sa.text("0")),
    )
    op.add_column(
        "subscription_price_snapshots",
        sa.Column("forced_upgrade_type", sa.String(), nullable=True),
    )
    op.add_column(
        "subscription_price_snapshots",
        sa.Column("applied_subscription_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "subscription_price_snapshots",
        sa.Column("applied_at", sa.DateTime(), nullable=True),
    )

    # remove defaults where appropriate
    conn = op.get_bind()
    # SQLite doesn't support ALTER COLUMN DROP DEFAULT
    if conn.dialect.name != "sqlite":
        op.alter_column("subscription_price_snapshots", "credit_amount", server_default=None)
        op.alter_column("subscription_price_snapshots", "is_downgrade", server_default=None)


def downgrade() -> None:
    op.drop_column("subscription_price_snapshots", "applied_at")
    op.drop_column("subscription_price_snapshots", "applied_subscription_id")
    op.drop_column("subscription_price_snapshots", "forced_upgrade_type")
    op.drop_column("subscription_price_snapshots", "is_downgrade")
    op.drop_column("subscription_price_snapshots", "credit_amount")

