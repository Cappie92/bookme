"""add_pre_visit_confirmations_enabled

Добавить поле pre_visit_confirmations_enabled в masters (toggle для PRE-visit подтверждений).

Revision ID: 20260205_pre_visit_enabled
Revises: 20260205_add_clients_sf
Create Date: 2026-02-05

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "20260205_pre_visit_enabled"
down_revision: Union[str, None] = "20260205_add_clients_sf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = [col["name"] for col in inspector.get_columns("masters")]
    if "pre_visit_confirmations_enabled" not in existing_columns:
        op.add_column(
            "masters",
            sa.Column("pre_visit_confirmations_enabled", sa.Boolean(), nullable=True, server_default="0"),
        )


def downgrade() -> None:
    op.drop_column("masters", "pre_visit_confirmations_enabled")
