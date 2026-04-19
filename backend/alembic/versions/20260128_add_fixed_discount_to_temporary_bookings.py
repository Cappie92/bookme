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
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("temporary_bookings")}
    for name, col in (
        ("fixed_discount_rule_type", sa.Column("fixed_discount_rule_type", sa.String(), nullable=True)),
        ("fixed_discount_rule_id", sa.Column("fixed_discount_rule_id", sa.Integer(), nullable=True)),
        ("fixed_discount_percent", sa.Column("fixed_discount_percent", sa.Float(), nullable=True)),
        ("fixed_discount_amount", sa.Column("fixed_discount_amount", sa.Float(), nullable=True)),
    ):
        if name not in cols:
            op.add_column("temporary_bookings", col)


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("temporary_bookings")}
    for name in ("fixed_discount_amount", "fixed_discount_percent", "fixed_discount_rule_id", "fixed_discount_rule_type"):
        if name in cols:
            op.drop_column("temporary_bookings", name)
