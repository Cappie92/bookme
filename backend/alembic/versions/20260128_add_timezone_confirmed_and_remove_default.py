"""add timezone_confirmed to masters, onboarding without default timezone

Revision ID: 20260128_tz_confirmed
Revises: 20260128_tb_fixed_discount
Create Date: 2026-01-28

- Добавляем master.timezone_confirmed (bool, default False).
- Существующие мастера с city+timezone считаем подтвердившими: timezone_confirmed=True.
- Новые мастера создаются с timezone=NULL; дефолт убран в модели.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260128_tz_confirmed"
down_revision: Union[str, None] = "20260128_tb_fixed_discount"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("masters")}
    if "timezone_confirmed" not in cols:
        op.add_column(
            "masters",
            sa.Column("timezone_confirmed", sa.Boolean(), nullable=False, server_default="0"),
        )
    # Существующие мастера с заданными city и timezone считаем подтвердившими выбор
    op.execute(
        "UPDATE masters SET timezone_confirmed = 1 "
        "WHERE timezone IS NOT NULL AND trim(COALESCE(timezone, '')) != '' "
        "AND city IS NOT NULL AND trim(COALESCE(city, '')) != ''"
    )


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("masters")}
    if "timezone_confirmed" in cols:
        op.drop_column("masters", "timezone_confirmed")
