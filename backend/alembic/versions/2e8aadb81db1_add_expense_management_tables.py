"""add_expense_management_tables

Revision ID: 2e8aadb81db1
Revises: 20d3129ef7ad
Create Date: 2025-08-16 17:20:54.696617

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2e8aadb81db1'
down_revision: Union[str, None] = '20d3129ef7ad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'expense_types' not in tables:
        op.create_table('expense_types',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('salon_id', sa.Integer(), nullable=True),
            sa.Column('indie_master_id', sa.Integer(), nullable=True),
            sa.Column('branch_id', sa.Integer(), nullable=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('color', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['branch_id'], ['salon_branches.id'], ),
            sa.ForeignKeyConstraint(['indie_master_id'], ['indie_masters.id'], ),
            sa.ForeignKeyConstraint(['salon_id'], ['salons.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    idx = {ix['name'] for ix in insp.get_indexes('expense_types')}
    for name, cols in (
        ('idx_expense_type_branch', ['branch_id']),
        ('idx_expense_type_indie_master', ['indie_master_id']),
        ('idx_expense_type_name', ['name']),
        ('idx_expense_type_salon', ['salon_id']),
    ):
        if name not in idx:
            op.create_index(name, 'expense_types', cols, unique=False)

    tables = insp.get_table_names()
    if 'expense_templates' not in tables:
        op.create_table('expense_templates',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('salon_id', sa.Integer(), nullable=True),
            sa.Column('indie_master_id', sa.Integer(), nullable=True),
            sa.Column('branch_id', sa.Integer(), nullable=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('expense_name', sa.String(), nullable=False),
            sa.Column('expense_type_id', sa.Integer(), nullable=False),
            sa.Column('contractor', sa.String(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['branch_id'], ['salon_branches.id'], ),
            sa.ForeignKeyConstraint(['expense_type_id'], ['expense_types.id'], ),
            sa.ForeignKeyConstraint(['indie_master_id'], ['indie_masters.id'], ),
            sa.ForeignKeyConstraint(['salon_id'], ['salons.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    idx = {ix['name'] for ix in insp.get_indexes('expense_templates')}
    for name, cols in (
        ('idx_expense_template_branch', ['branch_id']),
        ('idx_expense_template_indie_master', ['indie_master_id']),
        ('idx_expense_template_name', ['name']),
        ('idx_expense_template_salon', ['salon_id']),
    ):
        if name not in idx:
            op.create_index(name, 'expense_templates', cols, unique=False)

    tables = insp.get_table_names()
    if 'expenses' not in tables:
        op.create_table('expenses',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('salon_id', sa.Integer(), nullable=True),
            sa.Column('indie_master_id', sa.Integer(), nullable=True),
            sa.Column('branch_id', sa.Integer(), nullable=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('expense_type_id', sa.Integer(), nullable=False),
            sa.Column('amount_without_vat', sa.Float(), nullable=False),
            sa.Column('amount_with_vat', sa.Float(), nullable=False),
            sa.Column('is_vat_free', sa.Boolean(), nullable=True),
            sa.Column('contractor', sa.String(), nullable=False),
            sa.Column('expense_month', sa.Date(), nullable=False),
            sa.Column('is_recurring', sa.Boolean(), nullable=True),
            sa.Column('recurring_frequency', sa.String(), nullable=True),
            sa.Column('recurring_start_date', sa.Date(), nullable=True),
            sa.Column('recurring_end_date', sa.Date(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['branch_id'], ['salon_branches.id'], ),
            sa.ForeignKeyConstraint(['expense_type_id'], ['expense_types.id'], ),
            sa.ForeignKeyConstraint(['indie_master_id'], ['indie_masters.id'], ),
            sa.ForeignKeyConstraint(['salon_id'], ['salons.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    idx = {ix['name'] for ix in insp.get_indexes('expenses')}
    for name, cols in (
        ('idx_expense_branch', ['branch_id']),
        ('idx_expense_indie_master', ['indie_master_id']),
        ('idx_expense_month', ['expense_month']),
        ('idx_expense_recurring', ['is_recurring']),
        ('idx_expense_salon', ['salon_id']),
        ('idx_expense_type', ['expense_type_id']),
    ):
        if name not in idx:
            op.create_index(name, 'expenses', cols, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if 'expenses' in insp.get_table_names():
        for name in (
            'idx_expense_type',
            'idx_expense_salon',
            'idx_expense_recurring',
            'idx_expense_month',
            'idx_expense_indie_master',
            'idx_expense_branch',
        ):
            idx = {ix['name'] for ix in insp.get_indexes('expenses')}
            if name in idx:
                op.drop_index(name, table_name='expenses')
        op.drop_table('expenses')

    insp = sa.inspect(bind)
    if 'expense_templates' in insp.get_table_names():
        for name in (
            'idx_expense_template_salon',
            'idx_expense_template_name',
            'idx_expense_template_indie_master',
            'idx_expense_template_branch',
        ):
            idx = {ix['name'] for ix in insp.get_indexes('expense_templates')}
            if name in idx:
                op.drop_index(name, table_name='expense_templates')
        op.drop_table('expense_templates')

    insp = sa.inspect(bind)
    if 'expense_types' in insp.get_table_names():
        for name in (
            'idx_expense_type_salon',
            'idx_expense_type_name',
            'idx_expense_type_indie_master',
            'idx_expense_type_branch',
        ):
            idx = {ix['name'] for ix in insp.get_indexes('expense_types')}
            if name in idx:
                op.drop_index(name, table_name='expense_types')
        op.drop_table('expense_types')
