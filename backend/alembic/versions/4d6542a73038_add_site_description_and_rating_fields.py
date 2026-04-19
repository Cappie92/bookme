"""add_site_description_and_rating_fields

Revision ID: 4d6542a73038
Revises: b76241251664
Create Date: 2025-01-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4d6542a73038'
down_revision: Union[str, None] = 'b76241251664'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    m = {c['name'] for c in insp.get_columns('masters')}
    if 'site_description' not in m:
        op.add_column('masters', sa.Column('site_description', sa.Text(), nullable=True))

    bind = op.get_bind()
    insp = sa.inspect(bind)
    cmn = {c['name'] for c in insp.get_columns('client_master_notes')}
    if 'rating' not in cmn:
        op.add_column('client_master_notes', sa.Column('rating', sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cmn = {c['name'] for c in insp.get_columns('client_master_notes')}
    if 'rating' in cmn:
        op.drop_column('client_master_notes', 'rating')

    bind = op.get_bind()
    insp = sa.inspect(bind)
    m = {c['name'] for c in insp.get_columns('masters')}
    if 'site_description' in m:
        op.drop_column('masters', 'site_description')
