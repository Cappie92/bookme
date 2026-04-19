"""add_balance_system

Revision ID: add_balance_system
Revises: add_subscriptions_table
Create Date: 2024-12-19 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_balance_system'
down_revision = 'add_subscriptions_table'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    sub_cols = {c['name'] for c in insp.get_columns('subscriptions')}
    if 'start_date' not in sub_cols:
        op.add_column('subscriptions', sa.Column('start_date', sa.DateTime(), nullable=True))
    if 'end_date' not in sub_cols:
        op.add_column('subscriptions', sa.Column('end_date', sa.DateTime(), nullable=True))
    if 'daily_rate' not in sub_cols:
        op.add_column('subscriptions', sa.Column('daily_rate', sa.Float(), nullable=True))
    if 'is_active' not in sub_cols:
        op.add_column('subscriptions', sa.Column('is_active', sa.Boolean(), nullable=True))

    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if 'user_balances' not in tables:
        op.create_table(
            'user_balances',
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

    if 'balance_transactions' not in tables:
        op.create_table(
            'balance_transactions',
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

    if 'daily_subscription_charges' not in tables:
        op.create_table(
            'daily_subscription_charges',
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

    def _idx(table: str, name: str, columns: list, **kw):
        cur = sa.inspect(bind)
        names = {ix['name'] for ix in cur.get_indexes(table)}
        if name not in names:
            op.create_index(name, table, columns, **kw)

    _idx('user_balances', 'idx_user_balance_user', ['user_id'], unique=False)
    _idx('balance_transactions', 'idx_balance_transaction_user', ['user_id'], unique=False)
    _idx('balance_transactions', 'idx_balance_transaction_type', ['transaction_type'], unique=False)
    _idx('balance_transactions', 'idx_balance_transaction_date', ['created_at'], unique=False)
    _idx('daily_subscription_charges', 'idx_daily_charge_subscription', ['subscription_id'], unique=False)
    _idx('daily_subscription_charges', 'idx_daily_charge_date', ['charge_date'], unique=False)
    _idx('daily_subscription_charges', 'idx_daily_charge_status', ['status'], unique=False)
    _idx('user_balances', op.f('ix_user_balances_id'), ['id'], unique=False)
    _idx('balance_transactions', op.f('ix_balance_transactions_id'), ['id'], unique=False)
    _idx('daily_subscription_charges', op.f('ix_daily_subscription_charges_id'), ['id'], unique=False)


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
