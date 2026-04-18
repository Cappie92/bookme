"""add reason to daily_subscription_charges

Revision ID: 20260128_reason_dsc
Revises: fcd2292d1490
Create Date: 2026-01-28

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260128_reason_dsc'
down_revision = '20260128_tz_confirmed'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('daily_subscription_charges', sa.Column('reason', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('daily_subscription_charges', 'reason')
