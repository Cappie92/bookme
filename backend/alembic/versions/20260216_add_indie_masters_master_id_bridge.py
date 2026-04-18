"""add indie_masters.master_id bridge column (MASTER_CANON Stage 1.1)

Добавить колонку indie_masters.master_id (nullable), индекс.
Без FK/NOT NULL/UNIQUE на этом шаге.

Revision ID: 20260216_bridge
Revises: 7b21fbc7e4a0
Create Date: 2026-02-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260216_bridge"
down_revision: Union[str, None] = "7b21fbc7e4a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "indie_masters",
        sa.Column("master_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_indie_masters_master_id",
        "indie_masters",
        ["master_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_indie_masters_master_id", table_name="indie_masters")
    op.drop_column("indie_masters", "master_id")
