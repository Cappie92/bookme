"""add_tax_rates_table

Revision ID: b6752271cbca
Revises: 9d61976d31ea
Create Date: 2025-10-16 22:11:09.954903

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6752271cbca'
down_revision: Union[str, None] = '9d61976d31ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'tax_rates' not in insp.get_table_names():
        op.create_table('tax_rates',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('master_id', sa.Integer(), nullable=False),
            sa.Column('rate', sa.Float(), nullable=False),
            sa.Column('effective_from_date', sa.Date(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['master_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    idx_names = {ix['name'] for ix in insp.get_indexes('tax_rates')}
    if 'idx_tax_rates_master' not in idx_names:
        op.create_index('idx_tax_rates_master', 'tax_rates', ['master_id'], unique=False)
    if 'idx_tax_rates_date' not in idx_names:
        op.create_index('idx_tax_rates_date', 'tax_rates', ['effective_from_date'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'tax_rates' not in insp.get_table_names():
        return
    for name in ('idx_tax_rates_date', 'idx_tax_rates_master'):
        idx_names = {ix['name'] for ix in insp.get_indexes('tax_rates')}
        if name in idx_names:
            op.drop_index(name, table_name='tax_rates')
    op.drop_table('tax_rates')
