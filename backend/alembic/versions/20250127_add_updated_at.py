"""Add updated_at to indie_masters

Revision ID: 20250127_add_updated_at
Revises: 20250127_final_unified_master_update
Create Date: 2025-01-27 12:55:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250127_add_updated_at'
down_revision = '20250127_final_unified_master_update'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    cols = {c['name'] for c in sa.inspect(bind).get_columns('indie_masters')}
    if 'updated_at' not in cols:
        op.add_column('indie_masters', sa.Column('updated_at', sa.DateTime(), nullable=True))

    op.execute("UPDATE indie_masters SET updated_at = datetime('now')")


def downgrade():
    bind = op.get_bind()
    cols = {c['name'] for c in sa.inspect(bind).get_columns('indie_masters')}
    if 'updated_at' in cols:
        op.drop_column('indie_masters', 'updated_at')
