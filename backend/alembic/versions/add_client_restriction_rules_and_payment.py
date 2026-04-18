"""add_client_restriction_rules_and_payment

Revision ID: add_client_restriction_rules_and_payment
Revises: add_loyalty_points_system
Create Date: 2025-12-18 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_client_restriction_rules_and_payment'
down_revision: Union[str, None] = 'add_loyalty_points_system'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Проверяем существование таблиц перед созданием
    from sqlalchemy import inspect
    from sqlalchemy.engine import reflection
    
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Создаем таблицу правил автоматических ограничений
    if 'client_restriction_rules' not in existing_tables:
        op.create_table('client_restriction_rules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('master_id', sa.Integer(), nullable=False),
        sa.Column('cancellation_reason', sa.String(), nullable=False),
        sa.Column('cancel_count', sa.Integer(), nullable=False),
        sa.Column('period_days', sa.Integer(), nullable=True),  # NULL = все время
        sa.Column('restriction_type', sa.String(), nullable=False),  # 'blacklist' или 'advance_payment_only'
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['master_id'], ['masters.id'], ),
        sa.PrimaryKeyConstraint('id')
        )
        
        # Создаем индексы для правил ограничений
        op.create_index('idx_restriction_rules_master', 'client_restriction_rules', ['master_id'], unique=False)
        op.create_index('idx_restriction_rules_master_reason', 'client_restriction_rules', ['master_id', 'cancellation_reason', 'restriction_type'], unique=False)
    
    # Создаем таблицу настроек оплаты мастера
    if 'master_payment_settings' not in existing_tables:
        op.create_table('master_payment_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('master_id', sa.Integer(), nullable=False),
        sa.Column('accepts_online_payment', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['master_id'], ['masters.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('master_id')
        )
        
        # Создаем индекс для настроек оплаты
        op.create_index('idx_payment_settings_master', 'master_payment_settings', ['master_id'], unique=True)
    
    # Создаем таблицу временных броней
    if 'temporary_bookings' not in existing_tables:
        op.create_table('temporary_bookings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('master_id', sa.Integer(), nullable=False),
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('service_id', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.DateTime(), nullable=False),
        sa.Column('end_time', sa.DateTime(), nullable=False),
        sa.Column('payment_amount', sa.Float(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('payment_session_id', sa.String(), nullable=True),
        sa.Column('payment_link', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),  # 'pending', 'paid', 'expired', 'cancelled'
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['master_id'], ['masters.id'], ),
        sa.ForeignKeyConstraint(['client_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['service_id'], ['services.id'], ),
        sa.PrimaryKeyConstraint('id')
        )
        
        # Создаем индексы для временных броней
        op.create_index('idx_temporary_bookings_master', 'temporary_bookings', ['master_id'], unique=False)
        op.create_index('idx_temporary_bookings_client', 'temporary_bookings', ['client_id'], unique=False)
        op.create_index('idx_temporary_bookings_expires', 'temporary_bookings', ['expires_at'], unique=False)
        op.create_index('idx_temporary_bookings_status', 'temporary_bookings', ['status'], unique=False)


def downgrade() -> None:
    # Удаляем индексы временных броней
    op.drop_index('idx_temporary_bookings_status', table_name='temporary_bookings')
    op.drop_index('idx_temporary_bookings_expires', table_name='temporary_bookings')
    op.drop_index('idx_temporary_bookings_client', table_name='temporary_bookings')
    op.drop_index('idx_temporary_bookings_master', table_name='temporary_bookings')
    
    # Удаляем таблицу временных броней
    op.drop_table('temporary_bookings')
    
    # Удаляем индекс настроек оплаты
    op.drop_index('idx_payment_settings_master', table_name='master_payment_settings')
    
    # Удаляем таблицу настроек оплаты
    op.drop_table('master_payment_settings')
    
    # Удаляем индексы правил ограничений
    op.drop_index('idx_restriction_rules_master_reason', table_name='client_restriction_rules')
    op.drop_index('idx_restriction_rules_master', table_name='client_restriction_rules')
    
    # Удаляем таблицу правил ограничений
    op.drop_table('client_restriction_rules')

