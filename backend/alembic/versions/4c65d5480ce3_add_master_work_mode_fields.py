"""Add master work mode fields

Revision ID: 4c65d5480ce3
Revises:
Create Date: 2025-06-30 14:59:47.414861

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4c65d5480ce3'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("masters")}

    if "can_work_independently" not in existing_columns:
        op.add_column("masters", sa.Column("can_work_independently", sa.Boolean(), nullable=True))
    if "can_work_in_salon" not in existing_columns:
        op.add_column("masters", sa.Column("can_work_in_salon", sa.Boolean(), nullable=True))
    if "website" not in existing_columns:
        op.add_column("masters", sa.Column("website", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {col["name"] for col in inspector.get_columns("masters")}

    for col in ("website", "can_work_in_salon", "can_work_independently"):
        if col in existing_columns:
            op.drop_column("masters", col)
