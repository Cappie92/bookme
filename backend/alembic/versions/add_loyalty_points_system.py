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


def _idx_names(bind, table: str) -> set:
    return {ix['name'] for ix in sa.inspect(bind).get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'loyalty_settings' not in tables:
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

    bind = op.get_bind()
    if 'loyalty_settings' in sa.inspect(bind).get_table_names():
        if 'idx_loyalty_settings_master' not in _idx_names(bind, 'loyalty_settings'):
            op.create_index('idx_loyalty_settings_master', 'loyalty_settings', ['master_id'], unique=False)

    bind = op.get_bind()
    if 'loyalty_transactions' not in sa.inspect(bind).get_table_names():
        op.create_table('loyalty_transactions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('master_id', sa.Integer(), nullable=False),
            sa.Column('client_id', sa.Integer(), nullable=False),
            sa.Column('booking_id', sa.Integer(), nullable=True),
            sa.Column('transaction_type', sa.String(), nullable=False),
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

    bind = op.get_bind()
    if 'loyalty_transactions' in sa.inspect(bind).get_table_names():
        idx = _idx_names(bind, 'loyalty_transactions')
        for name, cols in (
            ('idx_loyalty_transactions_master_client', ['master_id', 'client_id']),
            ('idx_loyalty_transactions_client', ['client_id']),
            ('idx_loyalty_transactions_booking', ['booking_id']),
            ('idx_loyalty_transactions_expires', ['expires_at']),
            ('idx_loyalty_transactions_type', ['transaction_type']),
        ):
            if name not in idx:
                op.create_index(name, 'loyalty_transactions', cols, unique=False)

    bind = op.get_bind()
    bcols = {c['name'] for c in sa.inspect(bind).get_columns('bookings')}
    if 'loyalty_points_used' not in bcols:
        op.add_column('bookings', sa.Column('loyalty_points_used', sa.Integer(), nullable=True, server_default='0'))


def downgrade() -> None:
    bind = op.get_bind()
    bcols = {c['name'] for c in sa.inspect(bind).get_columns('bookings')}
    if 'loyalty_points_used' in bcols:
        op.drop_column('bookings', 'loyalty_points_used')

    if 'loyalty_transactions' in sa.inspect(bind).get_table_names():
        for name in (
            'idx_loyalty_transactions_type',
            'idx_loyalty_transactions_expires',
            'idx_loyalty_transactions_booking',
            'idx_loyalty_transactions_client',
            'idx_loyalty_transactions_master_client',
        ):
            bind = op.get_bind()
            if name in _idx_names(bind, 'loyalty_transactions'):
                op.drop_index(name, table_name='loyalty_transactions')
        op.drop_table('loyalty_transactions')

    bind = op.get_bind()
    if 'loyalty_settings' in sa.inspect(bind).get_table_names():
        if 'idx_loyalty_settings_master' in _idx_names(bind, 'loyalty_settings'):
            op.drop_index('idx_loyalty_settings_master', table_name='loyalty_settings')
        op.drop_table('loyalty_settings')
