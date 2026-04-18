"""add_master_client_metadata

Master-client metadata: alias_name, note (для раздела Клиенты).

Revision ID: 20260128_master_client_meta
Revises: 20260128_fix_future_aw
Create Date: 2026-01-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260128_master_client_meta"
down_revision: Union[str, None] = "20260128_fix_future_aw"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect
    conn = op.get_bind()
    insp = inspect(conn)
    if "master_client_metadata" in insp.get_table_names():
        return
    op.create_table(
        "master_client_metadata",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("master_id", sa.Integer(), nullable=False),
        sa.Column("client_phone", sa.String(), nullable=False),
        sa.Column("alias_name", sa.String(255), nullable=True),
        sa.Column("note", sa.String(280), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["master_id"], ["masters.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("master_id", "client_phone", name="uq_master_client_metadata_master_phone"),
    )
    op.create_index("idx_master_client_metadata_master", "master_client_metadata", ["master_id"], unique=False)
    op.create_index("idx_master_client_metadata_phone", "master_client_metadata", ["client_phone"], unique=False)


def downgrade() -> None:
    op.drop_index("idx_master_client_metadata_phone", table_name="master_client_metadata")
    op.drop_index("idx_master_client_metadata_master", table_name="master_client_metadata")
    op.drop_table("master_client_metadata")
