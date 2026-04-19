"""add address field to master

Revision ID: add_address_field_to_master
Revises: add_use_photo_as_logo_field
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_address_field_to_master'
down_revision = 'add_use_photo_as_logo_field'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('masters')}
    if 'address' not in cols:
        op.add_column('masters', sa.Column('address', sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('masters')}
    if 'address' in cols:
        op.drop_column('masters', 'address')
