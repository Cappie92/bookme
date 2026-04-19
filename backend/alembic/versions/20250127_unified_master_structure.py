"""Unified master structure migration

Revision ID: 20250127_unified_master
Revises: 63f4fee107cd
Create Date: 2025-01-27 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250127_unified_master'
down_revision = '63f4fee107cd'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if 'salon_masters' not in tables:
        op.create_table('salon_masters',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('master_id', sa.Integer(), nullable=False),
            sa.Column('salon_id', sa.Integer(), nullable=False),
            sa.Column('can_work_in_salon', sa.Boolean(), nullable=False, default=True),
            sa.Column('branch_id', sa.Integer(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['master_id'], ['masters.id'], ),
            sa.ForeignKeyConstraint(['salon_id'], ['salons.id'], ),
            sa.ForeignKeyConstraint(['branch_id'], ['salon_branches.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('master_id', 'salon_id', name='unique_master_salon')
        )

    if 'indie_masters_new' not in tables:
        op.create_table('indie_masters_new',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('master_id', sa.Integer(), nullable=False),
            sa.Column('can_work_independently', sa.Boolean(), nullable=False, default=False),
            sa.Column('domain', sa.String(), nullable=True),
            sa.Column('address', sa.String(), nullable=True),
            sa.Column('city', sa.String(), nullable=True),
            sa.Column('timezone', sa.String(), nullable=False, default='Europe/Moscow'),
            sa.Column('payment_on_visit', sa.Boolean(), nullable=False, default=True),
            sa.Column('payment_advance', sa.Boolean(), nullable=False, default=False),
            sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['master_id'], ['masters.id'], ),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('master_id', name='unique_master_indie'),
            sa.UniqueConstraint('domain', name='unique_indie_domain')
        )

    insp = sa.inspect(bind)
    if 'salon_masters' in insp.get_table_names():
        idx = {ix['name'] for ix in insp.get_indexes('salon_masters')}
        if 'idx_salon_masters_master' not in idx:
            op.create_index('idx_salon_masters_master', 'salon_masters', ['master_id'])
        if 'idx_salon_masters_salon' not in idx:
            op.create_index('idx_salon_masters_salon', 'salon_masters', ['salon_id'])

    insp = sa.inspect(bind)
    if 'indie_masters_new' in insp.get_table_names():
        idx = {ix['name'] for ix in insp.get_indexes('indie_masters_new')}
        if 'idx_indie_masters_new_master' not in idx:
            op.create_index('idx_indie_masters_new_master', 'indie_masters_new', ['master_id'])
        if 'idx_indie_masters_new_domain' not in idx:
            op.create_index('idx_indie_masters_new_domain', 'indie_masters_new', ['domain'])


def downgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if 'indie_masters_new' in insp.get_table_names():
        for name in ('idx_indie_masters_new_domain', 'idx_indie_masters_new_master'):
            idx = {ix['name'] for ix in insp.get_indexes('indie_masters_new')}
            if name in idx:
                op.drop_index(name, table_name='indie_masters_new')
        op.drop_table('indie_masters_new')

    insp = sa.inspect(bind)
    if 'salon_masters' in insp.get_table_names():
        for name in ('idx_salon_masters_salon', 'idx_salon_masters_master'):
            idx = {ix['name'] for ix in insp.get_indexes('salon_masters')}
            if name in idx:
                op.drop_index(name, table_name='salon_masters')
        op.drop_table('salon_masters')
