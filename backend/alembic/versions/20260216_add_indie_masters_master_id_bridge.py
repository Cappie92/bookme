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
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("indie_masters")}
    if "master_id" not in cols:
        op.add_column(
            "indie_masters",
            sa.Column("master_id", sa.Integer(), nullable=True),
        )
    bind = op.get_bind()
    idx_names = {ix["name"] for ix in sa.inspect(bind).get_indexes("indie_masters")}
    if "ix_indie_masters_master_id" not in idx_names:
        op.create_index(
            "ix_indie_masters_master_id",
            "indie_masters",
            ["master_id"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    idx_names = {ix["name"] for ix in sa.inspect(bind).get_indexes("indie_masters")}
    if "ix_indie_masters_master_id" in idx_names:
        op.drop_index("ix_indie_masters_master_id", table_name="indie_masters")
    cols = {c["name"] for c in sa.inspect(bind).get_columns("indie_masters")}
    if "master_id" in cols:
        op.drop_column("indie_masters", "master_id")
