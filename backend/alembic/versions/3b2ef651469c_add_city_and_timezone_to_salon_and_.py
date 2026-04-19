"""add_city_and_timezone_to_salon_and_master

Revision ID: 3b2ef651469c
Revises: 216a65f51252
Create Date: 2025-07-18 01:32:55.209418

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3b2ef651469c'
down_revision: Union[str, None] = '216a65f51252'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    masters_cols = {c['name'] for c in insp.get_columns('masters')}
    if 'city' not in masters_cols:
        op.add_column('masters', sa.Column('city', sa.String(), nullable=True))
    if 'timezone' not in masters_cols:
        op.add_column('masters', sa.Column('timezone', sa.String(), nullable=True))

    salons_cols = {c['name'] for c in insp.get_columns('salons')}
    if 'city' not in salons_cols:
        op.add_column('salons', sa.Column('city', sa.String(), nullable=True))
    if 'timezone' not in salons_cols:
        op.add_column('salons', sa.Column('timezone', sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    salons_cols = {c['name'] for c in insp.get_columns('salons')}
    masters_cols = {c['name'] for c in insp.get_columns('masters')}
    if 'timezone' in salons_cols:
        op.drop_column('salons', 'timezone')
    if 'city' in salons_cols:
        op.drop_column('salons', 'city')
    if 'timezone' in masters_cols:
        op.drop_column('masters', 'timezone')
    if 'city' in masters_cols:
        op.drop_column('masters', 'city')
