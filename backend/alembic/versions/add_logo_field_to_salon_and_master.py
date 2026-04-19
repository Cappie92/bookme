"""add logo field to salon and master

Revision ID: add_logo_field_to_salon_and_master
Revises: add_loyalty_system
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_logo_field_to_salon_and_master'
down_revision = 'add_loyalty_system'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    salons_cols = {c['name'] for c in insp.get_columns('salons')}
    masters_cols = {c['name'] for c in insp.get_columns('masters')}
    if 'logo' not in salons_cols:
        op.add_column('salons', sa.Column('logo', sa.String(), nullable=True))
    if 'logo' not in masters_cols:
        op.add_column('masters', sa.Column('logo', sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    salons_cols = {c['name'] for c in insp.get_columns('salons')}
    masters_cols = {c['name'] for c in insp.get_columns('masters')}
    if 'logo' in salons_cols:
        op.drop_column('salons', 'logo')
    if 'logo' in masters_cols:
        op.drop_column('masters', 'logo')
