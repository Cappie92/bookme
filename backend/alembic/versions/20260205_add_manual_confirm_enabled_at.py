"""add manual_confirm_enabled_at to masters

Revision ID: 20260205_manual_confirm
Revises: 20260205_add_pre_visit_confirmations_enabled
Create Date: 2025-02-05

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260205_manual_confirm'
down_revision = '20260205_pre_visit_enabled'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    cols = {c['name'] for c in sa.inspect(bind).get_columns('masters')}
    if 'manual_confirm_enabled_at' not in cols:
        op.add_column('masters', sa.Column('manual_confirm_enabled_at', sa.DateTime(), nullable=True))


def downgrade():
    bind = op.get_bind()
    cols = {c['name'] for c in sa.inspect(bind).get_columns('masters')}
    if 'manual_confirm_enabled_at' in cols:
        op.drop_column('masters', 'manual_confirm_enabled_at')
