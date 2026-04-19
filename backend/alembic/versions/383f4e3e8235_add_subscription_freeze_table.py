"""add_subscription_freeze_table

Revision ID: 383f4e3e8235
Revises: acfe03ddc463
Create Date: 2025-12-06 16:09:15.377417

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '383f4e3e8235'
down_revision: Union[str, None] = 'acfe03ddc463'
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
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if 'subscription_freezes' not in existing_tables:
        op.create_table(
            'subscription_freezes',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('subscription_id', sa.Integer(), nullable=False),
            sa.Column('start_date', sa.DateTime(), nullable=False),
            sa.Column('end_date', sa.DateTime(), nullable=False),
            sa.Column('freeze_days', sa.Integer(), nullable=False),
            sa.Column('is_cancelled', sa.Boolean(), nullable=True, server_default='0'),
            sa.Column('cancelled_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('idx_subscription_freeze_subscription', 'subscription_freezes', ['subscription_id'], unique=False)
        op.create_index('idx_subscription_freeze_dates', 'subscription_freezes', ['start_date', 'end_date'], unique=False)
        op.create_index(op.f('ix_subscription_freezes_id'), 'subscription_freezes', ['id'], unique=False)

    bind = op.get_bind()
    if not is_sqlite:
        op.create_foreign_key(None, 'bookings', 'users', ['cancelled_by_user_id'], ['id'])

    _drop_index_if_exists(bind, 'client_favorites', 'ix_client_favorites_id')
    bind = op.get_bind()
    if 'client_favorites' in sa.inspect(bind).get_table_names():
        ix = op.f('ix_client_favorites_client_favorite_id')
        if ix not in _idx_names(bind, 'client_favorites'):
            op.create_index(ix, 'client_favorites', ['client_favorite_id'], unique=False)

    bind = op.get_bind()
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
    _drop_index_if_exists(bind, 'subscription_addons', 'idx_subscription_addon_active')
    bind = op.get_bind()
    _drop_index_if_exists(bind, 'subscription_addons', 'idx_subscription_addon_type')

    bind = op.get_bind()
    if not is_sqlite and 'subscription_addons' in sa.inspect(bind).get_table_names():
        uq = sa.inspect(bind).get_unique_constraints('subscription_addons')
        has_name_uq = any('name' in (c.get('column_names') or []) for c in uq)
        if not has_name_uq:
            op.create_unique_constraint(None, 'subscription_addons', ['name'])

    bind = op.get_bind()
    _drop_index_if_exists(bind, 'subscription_plans', 'idx_subscription_plan_active')
    bind = op.get_bind()
    _drop_index_if_exists(bind, 'subscription_plans', 'idx_subscription_plan_type')

    bind = op.get_bind()
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

    if 'subscription_freezes' in sa.inspect(bind).get_table_names():
        for ix in (op.f('ix_subscription_freezes_id'), 'idx_subscription_freeze_dates', 'idx_subscription_freeze_subscription'):
            bind = op.get_bind()
            if ix in _idx_names(bind, 'subscription_freezes'):
                op.drop_index(ix, table_name='subscription_freezes')
        op.drop_table('subscription_freezes')

    bind = op.get_bind()
    if 'subscription_plans' in sa.inspect(bind).get_table_names():
        if 'idx_subscription_plan_type' not in _idx_names(bind, 'subscription_plans'):
            op.create_index('idx_subscription_plan_type', 'subscription_plans', ['subscription_type'], unique=False)
        if 'idx_subscription_plan_active' not in _idx_names(bind, 'subscription_plans'):
            op.create_index('idx_subscription_plan_active', 'subscription_plans', ['is_active'], unique=False)

    bind = op.get_bind()
    if not is_sqlite and 'subscription_addons' in sa.inspect(bind).get_table_names():
        op.drop_constraint(None, 'subscription_addons', type_='unique')

    bind = op.get_bind()
    if 'subscription_addons' in sa.inspect(bind).get_table_names():
        if 'idx_subscription_addon_type' not in _idx_names(bind, 'subscription_addons'):
            op.create_index('idx_subscription_addon_type', 'subscription_addons', ['subscription_type'], unique=False)
        if 'idx_subscription_addon_active' not in _idx_names(bind, 'subscription_addons'):
            op.create_index('idx_subscription_addon_active', 'subscription_addons', ['is_active'], unique=False)

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

    if not is_sqlite:
        op.drop_constraint(None, 'bookings', type_='foreignkey')
