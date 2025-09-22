"""add_subscriptions_table

Revision ID: add_subscriptions_table
Revises: 512de4141129
Create Date: 2024-12-19 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision = 'add_subscriptions_table'
down_revision = '512de4141129'
branch_labels = None
depends_on = None


def upgrade():
    # Создаем таблицу subscriptions (SQLite не поддерживает ENUM, используем String)
    op.create_table('subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('subscription_type', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('salon_branches', sa.Integer(), nullable=True),
        sa.Column('salon_employees', sa.Integer(), nullable=True),
        sa.Column('master_bookings', sa.Integer(), nullable=True),
        sa.Column('valid_until', sa.DateTime(), nullable=False),
        sa.Column('price', sa.Float(), nullable=False),
        sa.Column('auto_renewal', sa.Boolean(), nullable=True),
        sa.Column('payment_method', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Создаем индексы
    op.create_index('idx_subscription_user_type', 'subscriptions', ['user_id', 'subscription_type'], unique=False)
    op.create_index('idx_subscription_status', 'subscriptions', ['status'], unique=False)
    op.create_index('idx_subscription_valid_until', 'subscriptions', ['valid_until'], unique=False)
    op.create_index(op.f('ix_subscriptions_id'), 'subscriptions', ['id'], unique=False)


def downgrade():
    # Удаляем индексы
    op.drop_index(op.f('ix_subscriptions_id'), table_name='subscriptions')
    op.drop_index('idx_subscription_valid_until', table_name='subscriptions')
    op.drop_index('idx_subscription_status', table_name='subscriptions')
    op.drop_index('idx_subscription_user_type', table_name='subscriptions')
    
    # Удаляем таблицу
    op.drop_table('subscriptions') 