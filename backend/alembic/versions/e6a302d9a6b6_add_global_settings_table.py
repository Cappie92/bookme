"""add_global_settings_table

Revision ID: e6a302d9a6b6
Revises: 20260205_manual_confirm
Create Date: 2026-02-11 12:26:23.604477

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6a302d9a6b6'
down_revision: Union[str, None] = '20260205_manual_confirm'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _idx_names(bind, table: str) -> set:
    return {ix['name'] for ix in sa.inspect(bind).get_indexes(table)}


def upgrade() -> None:
    bind = op.get_bind()
    if 'global_settings' not in sa.inspect(bind).get_table_names():
        op.create_table('global_settings',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('key', sa.String(), nullable=False),
            sa.Column('value', sa.JSON(), nullable=False),
            sa.Column('description', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )

    bind = op.get_bind()
    idx = _idx_names(bind, 'global_settings')
    i1, i2 = op.f('ix_global_settings_id'), op.f('ix_global_settings_key')
    if i1 not in idx:
        op.create_index(i1, 'global_settings', ['id'], unique=False)
    if i2 not in idx:
        op.create_index(i2, 'global_settings', ['key'], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    if 'global_settings' not in sa.inspect(bind).get_table_names():
        return
    for ix in (op.f('ix_global_settings_key'), op.f('ix_global_settings_id')):
        bind = op.get_bind()
        if ix in _idx_names(bind, 'global_settings'):
            op.drop_index(ix, table_name='global_settings')
    op.drop_table('global_settings')
