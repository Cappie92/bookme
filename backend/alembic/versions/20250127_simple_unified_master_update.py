"""Simple unified master structure update

Revision ID: 20250127_simple_unified_master_update
Revises: cb9773884a4f
Create Date: 2025-01-27 12:45:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250127_simple_unified_master_update'
down_revision = 'cb9773884a4f'
branch_labels = None
depends_on = None


def _table_cols(bind, table: str) -> set:
    return {c['name'] for c in sa.inspect(bind).get_columns(table)}


def _idx_names(bind, table: str) -> set:
    return {ix['name'] for ix in sa.inspect(bind).get_indexes(table)}


def upgrade():
    bind = op.get_bind()

    b = _table_cols(bind, 'bookings')
    for name, col in (
        ('work_type', sa.Column('work_type', sa.String(), nullable=True)),
        ('salon_work_id', sa.Column('salon_work_id', sa.Integer(), nullable=True)),
        ('indie_work_id', sa.Column('indie_work_id', sa.Integer(), nullable=True)),
    ):
        if name not in b:
            op.add_column('bookings', col)

    bind = op.get_bind()
    s = _table_cols(bind, 'services')
    for name, col in (
        ('work_type', sa.Column('work_type', sa.String(), nullable=True)),
        ('master_id', sa.Column('master_id', sa.Integer(), nullable=True)),
        ('salon_work_id', sa.Column('salon_work_id', sa.Integer(), nullable=True)),
        ('indie_work_id', sa.Column('indie_work_id', sa.Integer(), nullable=True)),
    ):
        if name not in s:
            op.add_column('services', col)

    bind = op.get_bind()
    cr = _table_cols(bind, 'client_restrictions')
    for name, col in (
        ('work_type', sa.Column('work_type', sa.String(), nullable=True)),
        ('master_id', sa.Column('master_id', sa.Integer(), nullable=True)),
        ('salon_work_id', sa.Column('salon_work_id', sa.Integer(), nullable=True)),
        ('indie_work_id', sa.Column('indie_work_id', sa.Integer(), nullable=True)),
    ):
        if name not in cr:
            op.add_column('client_restrictions', col)

    for table, cols_spec in (
        ('incomes', (
            ('work_type', sa.Column('work_type', sa.String(), nullable=True)),
            ('master_id', sa.Column('master_id', sa.Integer(), nullable=True)),
            ('salon_work_id', sa.Column('salon_work_id', sa.Integer(), nullable=True)),
            ('indie_work_id', sa.Column('indie_work_id', sa.Integer(), nullable=True)),
        )),
        ('expenses', (
            ('work_type', sa.Column('work_type', sa.String(), nullable=True)),
            ('master_id', sa.Column('master_id', sa.Integer(), nullable=True)),
            ('salon_work_id', sa.Column('salon_work_id', sa.Integer(), nullable=True)),
            ('indie_work_id', sa.Column('indie_work_id', sa.Integer(), nullable=True)),
        )),
        ('expense_types', (
            ('work_type', sa.Column('work_type', sa.String(), nullable=True)),
            ('master_id', sa.Column('master_id', sa.Integer(), nullable=True)),
            ('salon_work_id', sa.Column('salon_work_id', sa.Integer(), nullable=True)),
            ('indie_work_id', sa.Column('indie_work_id', sa.Integer(), nullable=True)),
        )),
        ('expense_templates', (
            ('work_type', sa.Column('work_type', sa.String(), nullable=True)),
            ('master_id', sa.Column('master_id', sa.Integer(), nullable=True)),
            ('salon_work_id', sa.Column('salon_work_id', sa.Integer(), nullable=True)),
            ('indie_work_id', sa.Column('indie_work_id', sa.Integer(), nullable=True)),
        )),
        ('missed_revenues', (
            ('work_type', sa.Column('work_type', sa.String(), nullable=True)),
            ('master_id', sa.Column('master_id', sa.Integer(), nullable=True)),
            ('salon_work_id', sa.Column('salon_work_id', sa.Integer(), nullable=True)),
            ('indie_work_id', sa.Column('indie_work_id', sa.Integer(), nullable=True)),
        )),
    ):
        bind = op.get_bind()
        tc = _table_cols(bind, table)
        for name, col in cols_spec:
            if name not in tc:
                op.add_column(table, col)

    bind = op.get_bind()
    ims = _table_cols(bind, 'indie_master_schedules')
    for name, col in (
        ('work_type', sa.Column('work_type', sa.String(), nullable=True)),
        ('master_id', sa.Column('master_id', sa.Integer(), nullable=True)),
        ('indie_work_id', sa.Column('indie_work_id', sa.Integer(), nullable=True)),
    ):
        if name not in ims:
            op.add_column('indie_master_schedules', col)

    bind = op.get_bind()
    sm = _table_cols(bind, 'salon_masters')
    for name, col in (
        ('can_work_in_salon', sa.Column('can_work_in_salon', sa.Boolean(), nullable=True, default=True)),
        ('branch_id', sa.Column('branch_id', sa.Integer(), nullable=True)),
        ('is_active', sa.Column('is_active', sa.Boolean(), nullable=True, default=True)),
        ('created_at', sa.Column('created_at', sa.DateTime(), nullable=True)),
        ('updated_at', sa.Column('updated_at', sa.DateTime(), nullable=True)),
    ):
        if name not in sm:
            op.add_column('salon_masters', col)

    op.execute("UPDATE salon_masters SET can_work_in_salon = 1, is_active = 1, created_at = datetime('now'), updated_at = datetime('now')")

    bind = op.get_bind()
    im = _table_cols(bind, 'indie_masters')
    for name, col in (
        ('can_work_independently', sa.Column('can_work_independently', sa.Boolean(), nullable=True, default=True)),
        ('is_active', sa.Column('is_active', sa.Boolean(), nullable=True, default=True)),
        ('created_at', sa.Column('created_at', sa.DateTime(), nullable=True)),
        ('updated_at', sa.Column('updated_at', sa.DateTime(), nullable=True)),
    ):
        if name not in im:
            op.add_column('indie_masters', col)

    op.execute("UPDATE indie_masters SET can_work_independently = 1, is_active = 1, created_at = datetime('now'), updated_at = datetime('now')")

    for table, idx_name, cols in (
        ('bookings', 'idx_bookings_work_type', ['work_type']),
        ('services', 'idx_services_work_type', ['work_type']),
        ('client_restrictions', 'idx_client_restrictions_work_type', ['work_type']),
        ('incomes', 'idx_incomes_work_type', ['work_type']),
        ('expenses', 'idx_expenses_work_type', ['work_type']),
        ('expense_types', 'idx_expense_types_work_type', ['work_type']),
        ('expense_templates', 'idx_expense_templates_work_type', ['work_type']),
        ('missed_revenues', 'idx_missed_revenues_work_type', ['work_type']),
    ):
        bind = op.get_bind()
        names = _idx_names(bind, table)
        if idx_name not in names:
            op.create_index(idx_name, table, cols)


def downgrade():
    bind = op.get_bind()

    for table, idx_name in (
        ('missed_revenues', 'idx_missed_revenues_work_type'),
        ('expense_templates', 'idx_expense_templates_work_type'),
        ('expense_types', 'idx_expense_types_work_type'),
        ('expenses', 'idx_expenses_work_type'),
        ('incomes', 'idx_incomes_work_type'),
        ('client_restrictions', 'idx_client_restrictions_work_type'),
        ('services', 'idx_services_work_type'),
        ('bookings', 'idx_bookings_work_type'),
    ):
        if table in sa.inspect(bind).get_table_names():
            names = _idx_names(bind, table)
            if idx_name in names:
                op.drop_index(idx_name, table_name=table)

    bind = op.get_bind()

    for table, cols in (
        ('indie_master_schedules', ('indie_work_id', 'master_id', 'work_type')),
        ('missed_revenues', ('indie_work_id', 'salon_work_id', 'master_id', 'work_type')),
        ('expense_templates', ('indie_work_id', 'salon_work_id', 'master_id', 'work_type')),
        ('expense_types', ('indie_work_id', 'salon_work_id', 'master_id', 'work_type')),
        ('expenses', ('indie_work_id', 'salon_work_id', 'master_id', 'work_type')),
        ('incomes', ('indie_work_id', 'salon_work_id', 'master_id', 'work_type')),
        ('client_restrictions', ('indie_work_id', 'salon_work_id', 'master_id', 'work_type')),
        ('services', ('indie_work_id', 'salon_work_id', 'master_id', 'work_type')),
        ('bookings', ('indie_work_id', 'salon_work_id', 'work_type')),
    ):
        if table not in sa.inspect(bind).get_table_names():
            continue
        tc = _table_cols(bind, table)
        for c in cols:
            if c in tc:
                op.drop_column(table, c)
        bind = op.get_bind()

    bind = op.get_bind()
    if 'salon_masters' in sa.inspect(bind).get_table_names():
        sm = _table_cols(bind, 'salon_masters')
        for c in ('updated_at', 'created_at', 'is_active', 'branch_id', 'can_work_in_salon'):
            if c in sm:
                op.drop_column('salon_masters', c)

    bind = op.get_bind()
    if 'indie_masters' in sa.inspect(bind).get_table_names():
        im = _table_cols(bind, 'indie_masters')
        for c in ('updated_at', 'created_at', 'is_active', 'can_work_independently'):
            if c in im:
                op.drop_column('indie_masters', c)
