"""add_source_to_loyalty_transactions

Revision ID: 7b21fbc7e4a0
Revises: e6a302d9a6b6
Create Date: 2026-02-11 15:44:40.489961

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7b21fbc7e4a0'
down_revision: Union[str, None] = 'e6a302d9a6b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c['name'] for c in sa.inspect(bind).get_columns('loyalty_transactions')}
    if 'source' not in cols:
        op.add_column('loyalty_transactions', sa.Column('source', sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c['name'] for c in sa.inspect(bind).get_columns('loyalty_transactions')}
    if 'source' in cols:
        op.drop_column('loyalty_transactions', 'source')
