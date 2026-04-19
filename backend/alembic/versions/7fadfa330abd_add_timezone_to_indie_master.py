"""add_timezone_to_indie_master

Revision ID: 7fadfa330abd
Revises: 83aa1dd21aac
Create Date: 2025-08-27 00:07:51.612332

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7fadfa330abd'
down_revision: Union[str, None] = '83aa1dd21aac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('indie_masters')}
    if 'city' not in cols:
        op.add_column('indie_masters', sa.Column('city', sa.String(), nullable=True))
    if 'timezone' not in cols:
        op.add_column('indie_masters', sa.Column('timezone', sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('indie_masters')}
    if 'timezone' in cols:
        op.drop_column('indie_masters', 'timezone')
    if 'city' in cols:
        op.drop_column('indie_masters', 'city')
