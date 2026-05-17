"""readd salon address and working_hours (ORM sync)

Revision ID: 20260515_readd_salon_addr
Revises: 838e2b24a042
Create Date: 2026-05-15

Миграция 9ee705fff115 удалила address/working_hours из salons, но модель Salon
в models.py по-прежнему их маппит — при SELECT ORM падает на sqlite/postgres
без этих колонок.

Добавляем колонки обратно (идемпотентно), без изменения бизнес-логики.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "20260515_readd_salon_addr"
down_revision: Union[str, None] = "838e2b24a042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("salons")}
    if "address" not in cols:
        op.add_column("salons", sa.Column("address", sa.String(), nullable=True))
    if "working_hours" not in cols:
        op.add_column("salons", sa.Column("working_hours", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c["name"] for c in insp.get_columns("salons")}
    if "working_hours" in cols:
        op.drop_column("salons", "working_hours")
    if "address" in cols:
        op.drop_column("salons", "address")
