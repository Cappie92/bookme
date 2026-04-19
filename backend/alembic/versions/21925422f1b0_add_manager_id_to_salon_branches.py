"""add_manager_id_to_salon_branches

Revision ID: 21925422f1b0
Revises: add_branch_id_to_masters
Create Date: 2025-08-16 13:16:48.314801

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '21925422f1b0'
down_revision: Union[str, None] = 'add_branch_id_to_masters'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('salon_branches')}
    if 'manager_id' not in cols:
        op.add_column('salon_branches', sa.Column('manager_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('salon_branches')}
    if 'manager_id' in cols:
        op.drop_column('salon_branches', 'manager_id')
