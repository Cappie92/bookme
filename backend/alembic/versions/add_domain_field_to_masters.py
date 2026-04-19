"""add_domain_field_to_masters

Revision ID: add_domain_field_to_masters
Revises: 9e612d39ebc8
Create Date: 2025-01-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_domain_field_to_masters'
down_revision: Union[str, None] = '9e612d39ebc8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('masters')}
    if 'domain' not in cols:
        op.add_column('masters', sa.Column('domain', sa.String(), nullable=True))

    insp = sa.inspect(bind)
    uq_names = {u['name'] for u in insp.get_unique_constraints('masters')}
    has_domain_uq = any(
        tuple(u.get('column_names') or ()) == ('domain',)
        for u in insp.get_unique_constraints('masters')
    )
    if 'uq_masters_domain' not in uq_names and not has_domain_uq:
        op.create_unique_constraint('uq_masters_domain', 'masters', ['domain'])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    uq_names = {u['name'] for u in insp.get_unique_constraints('masters')}
    if 'uq_masters_domain' in uq_names:
        op.drop_constraint('uq_masters_domain', 'masters', type_='unique')
    cols = {c['name'] for c in insp.get_columns('masters')}
    if 'domain' in cols:
        op.drop_column('masters', 'domain')
