"""add_loyalty_points_system

Revision ID: add_loyalty_points_system
Revises: b6fe42368ede
Create Date: 2025-12-17 23:14:43.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_loyalty_points_system'
down_revision: Union[str, None] = 'b6fe42368ede'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Создаем таблицу настроек лояльности
    op.create_table('loyalty_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('master_id', sa.Integer(), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('accrual_percent', sa.Integer(), nullable=True),
        sa.Column('max_payment_percent', sa.Integer(), nullable=True),
        sa.Column('points_lifetime_days', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['master_id'], ['masters.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('master_id')
    )
    
    # Создаем индекс для настроек лояльности
    op.create_index('idx_loyalty_settings_master', 'loyalty_settings', ['master_id'], unique=False)
    
    # Создаем таблицу транзакций лояльности
    op.create_table('loyalty_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('master_id', sa.Integer(), nullable=False),
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('booking_id', sa.Integer(), nullable=True),
        sa.Column('transaction_type', sa.String(), nullable=False),  # 'earned' или 'spent'
        sa.Column('points', sa.Integer(), nullable=False),
        sa.Column('earned_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('service_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['booking_id'], ['bookings.id'], ),
        sa.ForeignKeyConstraint(['client_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['master_id'], ['masters.id'], ),
        sa.ForeignKeyConstraint(['service_id'], ['services.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Создаем индексы для транзакций лояльности
    op.create_index('idx_loyalty_transactions_master_client', 'loyalty_transactions', ['master_id', 'client_id'], unique=False)
    op.create_index('idx_loyalty_transactions_client', 'loyalty_transactions', ['client_id'], unique=False)
    op.create_index('idx_loyalty_transactions_booking', 'loyalty_transactions', ['booking_id'], unique=False)
    op.create_index('idx_loyalty_transactions_expires', 'loyalty_transactions', ['expires_at'], unique=False)
    op.create_index('idx_loyalty_transactions_type', 'loyalty_transactions', ['transaction_type'], unique=False)
    
    # Добавляем поле loyalty_points_used в таблицу bookings
    with op.batch_alter_table('bookings', schema=None) as batch_op:
        batch_op.add_column(sa.Column('loyalty_points_used', sa.Integer(), nullable=True, server_default='0'))


def downgrade() -> None:
    # Удаляем поле loyalty_points_used из bookings
    with op.batch_alter_table('bookings', schema=None) as batch_op:
        batch_op.drop_column('loyalty_points_used')
    
    # Удаляем индексы транзакций лояльности
    op.drop_index('idx_loyalty_transactions_type', table_name='loyalty_transactions')
    op.drop_index('idx_loyalty_transactions_expires', table_name='loyalty_transactions')
    op.drop_index('idx_loyalty_transactions_booking', table_name='loyalty_transactions')
    op.drop_index('idx_loyalty_transactions_client', table_name='loyalty_transactions')
    op.drop_index('idx_loyalty_transactions_master_client', table_name='loyalty_transactions')
    
    # Удаляем таблицу транзакций лояльности
    op.drop_table('loyalty_transactions')
    
    # Удаляем индекс настроек лояльности
    op.drop_index('idx_loyalty_settings_master', table_name='loyalty_settings')
    
    # Удаляем таблицу настроек лояльности
    op.drop_table('loyalty_settings')

