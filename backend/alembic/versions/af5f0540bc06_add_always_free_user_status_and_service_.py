"""Add always free user status and service types simple

Revision ID: af5f0540bc06
Revises: 046174ce7314
Create Date: 2025-09-16 22:48:37.304901

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'af5f0540bc06'
down_revision: Union[str, None] = '046174ce7314'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    users_cols = {c['name'] for c in insp.get_columns('users')}
    if 'is_always_free' not in users_cols:
        op.add_column('users', sa.Column('is_always_free', sa.Boolean(), nullable=True, default=False))

    services_cols = {c['name'] for c in insp.get_columns('services')}
    if 'service_type' not in services_cols:
        op.add_column('services', sa.Column('service_type', sa.String(), nullable=True, default='subscription'))

    insp = sa.inspect(bind)
    if 'always_free_logs' not in insp.get_table_names():
        op.create_table('always_free_logs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('admin_user_id', sa.Integer(), nullable=False),
            sa.Column('old_status', sa.Boolean(), nullable=False),
            sa.Column('new_status', sa.Boolean(), nullable=False),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['admin_user_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    if 'always_free_logs' in insp.get_table_names():
        idx_names = {ix['name'] for ix in insp.get_indexes('always_free_logs')}
        for name, cols in (
            ('idx_always_free_logs_user_id', ['user_id']),
            ('idx_always_free_logs_admin_user_id', ['admin_user_id']),
            ('idx_always_free_logs_created_at', ['created_at']),
        ):
            if name not in idx_names:
                op.create_index(name, 'always_free_logs', cols, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if 'always_free_logs' in insp.get_table_names():
        for name in (
            'idx_always_free_logs_created_at',
            'idx_always_free_logs_admin_user_id',
            'idx_always_free_logs_user_id',
        ):
            idx_names = {ix['name'] for ix in insp.get_indexes('always_free_logs')}
            if name in idx_names:
                op.drop_index(name, table_name='always_free_logs')
        op.drop_table('always_free_logs')

    insp = sa.inspect(bind)
    services_cols = {c['name'] for c in insp.get_columns('services')}
    if 'service_type' in services_cols:
        op.drop_column('services', 'service_type')

    users_cols = {c['name'] for c in insp.get_columns('users')}
    if 'is_always_free' in users_cols:
        op.drop_column('users', 'is_always_free')
