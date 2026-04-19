"""add_client_restrictions_table

Revision ID: 20d3129ef7ad
Revises: 4a3162c37a1c
Create Date: 2025-08-16 16:36:12.420740

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20d3129ef7ad'
down_revision: Union[str, None] = '4a3162c37a1c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'client_restrictions' not in insp.get_table_names():
        op.create_table('client_restrictions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('salon_id', sa.Integer(), nullable=True),
            sa.Column('indie_master_id', sa.Integer(), nullable=True),
            sa.Column('client_phone', sa.String(), nullable=False),
            sa.Column('restriction_type', sa.Enum('blacklist', 'advance_payment_only', name='restrictiontype'), nullable=False),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['indie_master_id'], ['indie_masters.id'], ),
            sa.ForeignKeyConstraint(['salon_id'], ['salons.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    idx_names = {ix['name'] for ix in insp.get_indexes('client_restrictions')}
    for name, cols, unique in (
        ('idx_client_restriction_salon', ['salon_id'], False),
        ('idx_client_restriction_indie_master', ['indie_master_id'], False),
        ('idx_client_restriction_phone', ['client_phone'], False),
        ('idx_client_restriction_type', ['restriction_type'], False),
        ('idx_client_restriction_active', ['is_active'], False),
        ('idx_client_restriction_unique', ['salon_id', 'indie_master_id', 'client_phone', 'restriction_type'], True),
    ):
        if name not in idx_names:
            op.create_index(name, 'client_restrictions', cols, unique=unique)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'client_restrictions' not in insp.get_table_names():
        return
    for name in (
        'idx_client_restriction_unique',
        'idx_client_restriction_active',
        'idx_client_restriction_type',
        'idx_client_restriction_phone',
        'idx_client_restriction_indie_master',
        'idx_client_restriction_salon',
    ):
        idx_names = {ix['name'] for ix in insp.get_indexes('client_restrictions')}
        if name in idx_names:
            op.drop_index(name, table_name='client_restrictions')
    op.drop_table('client_restrictions')
