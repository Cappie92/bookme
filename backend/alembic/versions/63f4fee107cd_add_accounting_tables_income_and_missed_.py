"""add_accounting_tables_income_and_missed_revenue

Revision ID: 63f4fee107cd
Revises: 2e8aadb81db1
Create Date: 2025-08-16 17:44:32.110123

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '63f4fee107cd'
down_revision: Union[str, None] = '2e8aadb81db1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'incomes' not in insp.get_table_names():
        op.create_table('incomes',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('salon_id', sa.Integer(), nullable=True),
            sa.Column('indie_master_id', sa.Integer(), nullable=True),
            sa.Column('branch_id', sa.Integer(), nullable=True),
            sa.Column('booking_id', sa.Integer(), nullable=False),
            sa.Column('total_amount', sa.Float(), nullable=False),
            sa.Column('master_earnings', sa.Float(), nullable=False),
            sa.Column('salon_earnings', sa.Float(), nullable=False),
            sa.Column('income_date', sa.Date(), nullable=False),
            sa.Column('service_date', sa.Date(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['booking_id'], ['bookings.id'], ),
            sa.ForeignKeyConstraint(['branch_id'], ['salon_branches.id'], ),
            sa.ForeignKeyConstraint(['indie_master_id'], ['indie_masters.id'], ),
            sa.ForeignKeyConstraint(['salon_id'], ['salons.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    idx = {ix['name'] for ix in insp.get_indexes('incomes')}
    for name, cols in (
        ('idx_income_booking', ['booking_id']),
        ('idx_income_branch', ['branch_id']),
        ('idx_income_date', ['income_date']),
        ('idx_income_indie_master', ['indie_master_id']),
        ('idx_income_salon', ['salon_id']),
        ('idx_income_service_date', ['service_date']),
    ):
        if name not in idx:
            op.create_index(name, 'incomes', cols, unique=False)

    insp = sa.inspect(bind)
    if 'missed_revenues' not in insp.get_table_names():
        op.create_table('missed_revenues',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('salon_id', sa.Integer(), nullable=True),
            sa.Column('indie_master_id', sa.Integer(), nullable=True),
            sa.Column('branch_id', sa.Integer(), nullable=True),
            sa.Column('booking_id', sa.Integer(), nullable=False),
            sa.Column('client_id', sa.Integer(), nullable=False),
            sa.Column('missed_amount', sa.Float(), nullable=False),
            sa.Column('service_price', sa.Float(), nullable=False),
            sa.Column('reason', sa.String(), nullable=True),
            sa.Column('missed_date', sa.Date(), nullable=False),
            sa.Column('booking_date', sa.Date(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['booking_id'], ['bookings.id'], ),
            sa.ForeignKeyConstraint(['branch_id'], ['salon_branches.id'], ),
            sa.ForeignKeyConstraint(['client_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['indie_master_id'], ['indie_masters.id'], ),
            sa.ForeignKeyConstraint(['salon_id'], ['salons.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    idx = {ix['name'] for ix in insp.get_indexes('missed_revenues')}
    for name, cols in (
        ('idx_missed_revenue_booking', ['booking_id']),
        ('idx_missed_revenue_branch', ['branch_id']),
        ('idx_missed_revenue_client', ['client_id']),
        ('idx_missed_revenue_date', ['missed_date']),
        ('idx_missed_revenue_indie_master', ['indie_master_id']),
        ('idx_missed_revenue_salon', ['salon_id']),
    ):
        if name not in idx:
            op.create_index(name, 'missed_revenues', cols, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if 'missed_revenues' in insp.get_table_names():
        for name in (
            'idx_missed_revenue_salon',
            'idx_missed_revenue_indie_master',
            'idx_missed_revenue_date',
            'idx_missed_revenue_client',
            'idx_missed_revenue_branch',
            'idx_missed_revenue_booking',
        ):
            idx = {ix['name'] for ix in insp.get_indexes('missed_revenues')}
            if name in idx:
                op.drop_index(name, table_name='missed_revenues')
        op.drop_table('missed_revenues')

    insp = sa.inspect(bind)
    if 'incomes' in insp.get_table_names():
        for name in (
            'idx_income_service_date',
            'idx_income_salon',
            'idx_income_indie_master',
            'idx_income_date',
            'idx_income_branch',
            'idx_income_booking',
        ):
            idx = {ix['name'] for ix in insp.get_indexes('incomes')}
            if name in idx:
                op.drop_index(name, table_name='incomes')
        op.drop_table('incomes')
