"""Add always free user status and service types simple

Revision ID: af5f0540bc06
Revises: 046174ce7314
Create Date: 2025-09-16 22:48:37.304901

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'af5f0540bc06'
down_revision: Union[str, None] = '046174ce7314'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем поле is_always_free в таблицу users
    op.add_column('users', sa.Column('is_always_free', sa.Boolean(), nullable=True, default=False))
    
    # Добавляем поле service_type в таблицу services
    op.add_column('services', sa.Column('service_type', sa.String(), nullable=True, default='subscription'))
    
    # Создаем таблицу always_free_logs
    op.create_table('always_free_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('admin_user_id', sa.Integer(), nullable=False),
        sa.Column('old_status', sa.Boolean(), nullable=False),
        sa.Column('new_status', sa.Boolean(), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['admin_user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Создаем индексы для always_free_logs
    op.create_index('idx_always_free_logs_user_id', 'always_free_logs', ['user_id'], unique=False)
    op.create_index('idx_always_free_logs_admin_user_id', 'always_free_logs', ['admin_user_id'], unique=False)
    op.create_index('idx_always_free_logs_created_at', 'always_free_logs', ['created_at'], unique=False)


def downgrade() -> None:
    # Удаляем индексы
    op.drop_index('idx_always_free_logs_created_at', table_name='always_free_logs')
    op.drop_index('idx_always_free_logs_admin_user_id', table_name='always_free_logs')
    op.drop_index('idx_always_free_logs_user_id', table_name='always_free_logs')
    
    # Удаляем таблицу
    op.drop_table('always_free_logs')
    
    # Удаляем колонки
    op.drop_column('services', 'service_type')
    op.drop_column('users', 'is_always_free')
