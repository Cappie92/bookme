"""add_auto_confirm_bookings_to_master

Revision ID: acfe03ddc463
Revises: bbed650921e4
Create Date: 2025-11-27 13:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'acfe03ddc463'
down_revision: Union[str, None] = 'bbed650921e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Проверяем существование колонки перед добавлением
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = [col['name'] for col in inspector.get_columns('masters')]
    
    if 'auto_confirm_bookings' not in existing_columns:
        op.add_column('masters', sa.Column('auto_confirm_bookings', sa.Boolean(), nullable=True, server_default='0'))


def downgrade() -> None:
    op.drop_column('masters', 'auto_confirm_bookings')
