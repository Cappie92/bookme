"""add_balance_system

Revision ID: add_balance_system
Revises: add_subscriptions_table
Create Date: 2024-12-19 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision = 'add_balance_system'
down_revision = 'add_subscriptions_table'
branch_labels = None
depends_on = None


def upgrade():
    # Обновляем таблицу subscriptions
    op.add_column('subscriptions', sa.Column('start_date', sa.DateTime(), nullable=True))
    op.add_column('subscriptions', sa.Column('end_date', sa.DateTime(), nullable=True))
    op.add_column('subscriptions', sa.Column('daily_rate', sa.Float(), nullable=True))
    op.add_column('subscriptions', sa.Column('is_active', sa.Boolean(), nullable=True))
    
    # Создаем таблицу user_balances
    op.create_table('user_balances',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('balance', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id')
    )
    
    # Создаем таблицу balance_transactions
    op.create_table('balance_transactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('transaction_type', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('subscription_id', sa.Integer(), nullable=True),
        sa.Column('balance_before', sa.Integer(), nullable=False),
        sa.Column('balance_after', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Создаем таблицу daily_subscription_charges
    op.create_table('daily_subscription_charges',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('subscription_id', sa.Integer(), nullable=False),
        sa.Column('charge_date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('daily_rate', sa.Integer(), nullable=False),
        sa.Column('balance_before', sa.Integer(), nullable=False),
        sa.Column('balance_after', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Создаем индексы
    op.create_index('idx_user_balance_user', 'user_balances', ['user_id'], unique=False)
    op.create_index('idx_balance_transaction_user', 'balance_transactions', ['user_id'], unique=False)
    op.create_index('idx_balance_transaction_type', 'balance_transactions', ['transaction_type'], unique=False)
    op.create_index('idx_balance_transaction_date', 'balance_transactions', ['created_at'], unique=False)
    op.create_index('idx_daily_charge_subscription', 'daily_subscription_charges', ['subscription_id'], unique=False)
    op.create_index('idx_daily_charge_date', 'daily_subscription_charges', ['charge_date'], unique=False)
    op.create_index('idx_daily_charge_status', 'daily_subscription_charges', ['status'], unique=False)
    op.create_index(op.f('ix_user_balances_id'), 'user_balances', ['id'], unique=False)
    op.create_index(op.f('ix_balance_transactions_id'), 'balance_transactions', ['id'], unique=False)
    op.create_index(op.f('ix_daily_subscription_charges_id'), 'daily_subscription_charges', ['id'], unique=False)


def downgrade():
    # Удаляем индексы
    op.drop_index(op.f('ix_daily_subscription_charges_id'), table_name='daily_subscription_charges')
    op.drop_index(op.f('ix_balance_transactions_id'), table_name='balance_transactions')
    op.drop_index(op.f('ix_user_balances_id'), table_name='user_balances')
    op.drop_index('idx_daily_charge_status', table_name='daily_subscription_charges')
    op.drop_index('idx_daily_charge_date', table_name='daily_subscription_charges')
    op.drop_index('idx_daily_charge_subscription', table_name='daily_subscription_charges')
    op.drop_index('idx_balance_transaction_date', table_name='balance_transactions')
    op.drop_index('idx_balance_transaction_type', table_name='balance_transactions')
    op.drop_index('idx_balance_transaction_user', table_name='balance_transactions')
    op.drop_index('idx_user_balance_user', table_name='user_balances')
    
    # Удаляем таблицы
    op.drop_table('daily_subscription_charges')
    op.drop_table('balance_transactions')
    op.drop_table('user_balances')
    
    # Удаляем колонки из subscriptions
    op.drop_column('subscriptions', 'is_active')
    op.drop_column('subscriptions', 'daily_rate')
    op.drop_column('subscriptions', 'end_date')
    op.drop_column('subscriptions', 'start_date') 