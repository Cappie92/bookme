"""add fixed_discount fields to temporary_bookings

Revision ID: 20260128_tb_fixed_discount
Revises: fcd2292d1490
Create Date: 2026-01-28

Фиксация скидки при создании temporary booking.
При confirm используем сохранённые данные, не пересчитываем.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260128_tb_fixed_discount"
down_revision: Union[str, None] = "fcd2292d1490"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "temporary_bookings",
        sa.Column("fixed_discount_rule_type", sa.String(), nullable=True),
    )
    op.add_column(
        "temporary_bookings",
        sa.Column("fixed_discount_rule_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "temporary_bookings",
        sa.Column("fixed_discount_percent", sa.Float(), nullable=True),
    )
    op.add_column(
        "temporary_bookings",
        sa.Column("fixed_discount_amount", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("temporary_bookings", "fixed_discount_amount")
    op.drop_column("temporary_bookings", "fixed_discount_percent")
    op.drop_column("temporary_bookings", "fixed_discount_rule_id")
    op.drop_column("temporary_bookings", "fixed_discount_rule_type")
