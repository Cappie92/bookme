"""add_subscription_price_snapshot_table

Revision ID: b6fe42368ede
Revises: 757589d7d340
Create Date: 2025-12-07 12:28:37.571274

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6fe42368ede'
down_revision: Union[str, None] = '757589d7d340'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _idx_names(bind, table: str) -> set:
    return {ix['name'] for ix in sa.inspect(bind).get_indexes(table)}


def _drop_index_if_exists(bind, table: str, name: str) -> None:
    if table not in sa.inspect(bind).get_table_names():
        return
    if name in _idx_names(bind, table):
        op.drop_index(name, table_name=table)


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == 'sqlite'

    if 'subscription_price_snapshots' not in sa.inspect(bind).get_table_names():
        op.create_table('subscription_price_snapshots',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('plan_id', sa.Integer(), nullable=False),
            sa.Column('duration_months', sa.Integer(), nullable=False),
            sa.Column('price_1month', sa.Float(), nullable=False),
            sa.Column('price_3months', sa.Float(), nullable=False),
            sa.Column('price_6months', sa.Float(), nullable=False),
            sa.Column('price_12months', sa.Float(), nullable=False),
            sa.Column('total_price', sa.Float(), nullable=False),
            sa.Column('monthly_price', sa.Float(), nullable=False),
            sa.Column('daily_price', sa.Float(), nullable=False),
            sa.Column('reserved_balance', sa.Float(), nullable=True),
            sa.Column('final_price', sa.Float(), nullable=False),
            sa.Column('upgrade_type', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('expires_at', sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(['plan_id'], ['subscription_plans.id'], ),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    bind = op.get_bind()
    if 'subscription_price_snapshots' in sa.inspect(bind).get_table_names():
        idx = _idx_names(bind, 'subscription_price_snapshots')
        for name, cols in (
            ('idx_snapshot_expires', ['expires_at']),
            ('idx_snapshot_user_created', ['user_id', 'created_at']),
            (op.f('ix_subscription_price_snapshots_id'), ['id']),
            (op.f('ix_subscription_price_snapshots_user_id'), ['user_id']),
        ):
            if name not in idx:
                op.create_index(name, 'subscription_price_snapshots', cols, unique=False)

    _drop_index_if_exists(bind, 'client_favorites', 'ix_client_favorites_id')
    bind = op.get_bind()
    if 'client_favorites' in sa.inspect(bind).get_table_names():
        ix = op.f('ix_client_favorites_client_favorite_id')
        if ix not in _idx_names(bind, 'client_favorites'):
            op.create_index(ix, 'client_favorites', ['client_favorite_id'], unique=False)

    if not is_sqlite:
        op.alter_column('client_master_notes', 'salon_id',
                        existing_type=sa.INTEGER(),
                        nullable=False)

    bind = op.get_bind()
    cmn = {c['name'] for c in sa.inspect(bind).get_columns('client_master_notes')}
    if 'rating' in cmn:
        op.drop_column('client_master_notes', 'rating')

    bind = op.get_bind()
    _drop_index_if_exists(bind, 'master_page_modules', 'idx_master_page_module_master')
    bind = op.get_bind()
    _drop_index_if_exists(bind, 'master_page_modules', 'idx_master_page_module_position')
    bind = op.get_bind()
    _drop_index_if_exists(bind, 'subscription_plans', 'idx_subscription_plan_active')
    bind = op.get_bind()
    _drop_index_if_exists(bind, 'subscription_plans', 'idx_subscription_plan_type')

    if not is_sqlite:
        op.create_foreign_key(None, 'subscriptions', 'subscription_plans', ['plan_id'], ['id'])

    bind = op.get_bind()
    if 'tax_rates' in sa.inspect(bind).get_table_names():
        ix = op.f('ix_tax_rates_id')
        if ix not in _idx_names(bind, 'tax_rates'):
            op.create_index(ix, 'tax_rates', ['id'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == 'sqlite'

    if 'tax_rates' in sa.inspect(bind).get_table_names():
        ix = op.f('ix_tax_rates_id')
        if ix in _idx_names(bind, 'tax_rates'):
            op.drop_index(ix, table_name='tax_rates')

    if not is_sqlite:
        op.drop_constraint(None, 'subscriptions', type_='foreignkey')

    bind = op.get_bind()
    if 'subscription_plans' in sa.inspect(bind).get_table_names():
        if 'idx_subscription_plan_type' not in _idx_names(bind, 'subscription_plans'):
            op.create_index('idx_subscription_plan_type', 'subscription_plans', ['subscription_type'], unique=False)
        if 'idx_subscription_plan_active' not in _idx_names(bind, 'subscription_plans'):
            op.create_index('idx_subscription_plan_active', 'subscription_plans', ['is_active'], unique=False)

    bind = op.get_bind()
    if 'master_page_modules' in sa.inspect(bind).get_table_names():
        if 'idx_master_page_module_position' not in _idx_names(bind, 'master_page_modules'):
            op.create_index('idx_master_page_module_position', 'master_page_modules', ['master_id', 'position'], unique=False)
        if 'idx_master_page_module_master' not in _idx_names(bind, 'master_page_modules'):
            op.create_index('idx_master_page_module_master', 'master_page_modules', ['master_id'], unique=False)

    bind = op.get_bind()
    cmn = {c['name'] for c in sa.inspect(bind).get_columns('client_master_notes')}
    if 'rating' not in cmn:
        op.add_column('client_master_notes', sa.Column('rating', sa.VARCHAR(), nullable=True))

    if not is_sqlite:
        op.alter_column('client_master_notes', 'salon_id',
                        existing_type=sa.INTEGER(),
                        nullable=True)

    bind = op.get_bind()
    if 'client_favorites' in sa.inspect(bind).get_table_names():
        ix = op.f('ix_client_favorites_client_favorite_id')
        if ix in _idx_names(bind, 'client_favorites'):
            op.drop_index(ix, table_name='client_favorites')
        if 'ix_client_favorites_id' not in _idx_names(bind, 'client_favorites'):
            op.create_index('ix_client_favorites_id', 'client_favorites', ['client_favorite_id'], unique=False)

    if 'subscription_price_snapshots' in sa.inspect(bind).get_table_names():
        for ix in (
            op.f('ix_subscription_price_snapshots_user_id'),
            op.f('ix_subscription_price_snapshots_id'),
            'idx_snapshot_user_created',
            'idx_snapshot_expires',
        ):
            bind = op.get_bind()
            if ix in _idx_names(bind, 'subscription_price_snapshots'):
                op.drop_index(ix, table_name='subscription_price_snapshots')
        op.drop_table('subscription_price_snapshots')
