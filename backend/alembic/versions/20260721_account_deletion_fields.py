"""account deletion soft-delete fields

Revision ID: 20260721_account_deletion_fields
Revises: 20260713_subscription_points_debit_unique
Create Date: 2026-07-21

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260721_account_deletion_fields"
down_revision: Union[str, None] = "20260713_subscription_points_debit_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column(
        "masters",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("masters", sa.Column("deleted_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("masters", "deleted_at")
    op.drop_column("masters", "is_deleted")
    op.drop_column("users", "deleted_at")
