"""add_salon_master_service_settings

Revision ID: add_salon_master_service_settings
Revises: 3b2ef651469c
Create Date: 2025-07-19 21:30:09.532442

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_salon_master_service_settings'
down_revision: Union[str, None] = '3b2ef651469c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Создаем таблицу salon_master_service_settings
    op.create_table('salon_master_service_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('master_id', sa.Integer(), nullable=True),
        sa.Column('salon_id', sa.Integer(), nullable=True),
        sa.Column('service_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('master_payment_type', sa.String(), nullable=True),
        sa.Column('master_payment_value', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['master_id'], ['masters.id'], ),
        sa.ForeignKeyConstraint(['salon_id'], ['salons.id'], ),
        sa.ForeignKeyConstraint(['service_id'], ['services.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('master_id', 'salon_id', 'service_id', name='unique_master_salon_service')
    )
    op.create_index(op.f('ix_salon_master_service_settings_id'), 'salon_master_service_settings', ['id'], unique=False)


def downgrade() -> None:
    # Удаляем таблицу salon_master_service_settings
    op.drop_index(op.f('ix_salon_master_service_settings_id'), table_name='salon_master_service_settings')
    op.drop_table('salon_master_service_settings') 