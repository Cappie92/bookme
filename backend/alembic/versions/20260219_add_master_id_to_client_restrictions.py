"""add master_id to client_restrictions for master-only mode

Revision ID: 20260219_master_restrict
Revises: 20260216_fav_migrate
Create Date: 2026-02-19

Master-only: restrictions belong to master_id (masters.id).
Legacy: indie_master_id (indie_masters.id) remains for LEGACY_INDIE_MODE=1.

На SQLite batch_alter_table даёт CircularDependency — используем ADD COLUMN и без FK.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '20260219_master_restrict'
down_revision: Union[str, None] = '20260216_fav_migrate'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _idx_names(bind, table: str) -> set:
    return {ix['name'] for ix in sa.inspect(bind).get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    is_sqlite = bind.dialect.name == 'sqlite'
    cols = {c['name'] for c in sa.inspect(bind).get_columns('client_restrictions')}
    if 'master_id' not in cols:
        op.add_column('client_restrictions', sa.Column('master_id', sa.Integer(), nullable=True))

    if not is_sqlite:
        op.create_foreign_key(
            'fk_client_restrictions_master_id',
            'client_restrictions',
            'masters',
            ['master_id'],
            ['id'],
        )

    bind = op.get_bind()
    if 'idx_client_restriction_master' not in _idx_names(bind, 'client_restrictions'):
        op.create_index('idx_client_restriction_master', 'client_restrictions', ['master_id'], unique=False)

    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_client_restriction_unique_master
        ON client_restrictions (master_id, client_phone, restriction_type)
        WHERE master_id IS NOT NULL
    """)


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS idx_client_restriction_unique_master')

    bind = op.get_bind()
    is_sqlite = bind.dialect.name == 'sqlite'

    if 'idx_client_restriction_master' in _idx_names(bind, 'client_restrictions'):
        op.drop_index('idx_client_restriction_master', table_name='client_restrictions')

    if not is_sqlite:
        op.drop_constraint('fk_client_restrictions_master_id', 'client_restrictions', type_='foreignkey')

    cols = {c['name'] for c in sa.inspect(bind).get_columns('client_restrictions')}
    if 'master_id' in cols:
        op.drop_column('client_restrictions', 'master_id')
