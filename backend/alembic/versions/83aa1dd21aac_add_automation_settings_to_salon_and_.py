"""add_automation_settings_to_salon_and_master

Revision ID: 83aa1dd21aac
Revises: 63f4fee107cd
Create Date: 2025-08-16 18:09:57.893628

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '83aa1dd21aac'
down_revision: Union[str, None] = '63f4fee107cd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    salons = {c['name'] for c in insp.get_columns('salons')}
    if 'missed_sessions_advance_payment_threshold' not in salons:
        op.add_column('salons', sa.Column('missed_sessions_advance_payment_threshold', sa.Integer(), nullable=True, server_default='3'))
    if 'missed_sessions_blacklist_threshold' not in salons:
        op.add_column('salons', sa.Column('missed_sessions_blacklist_threshold', sa.Integer(), nullable=True, server_default='5'))
    if 'cancellation_grace_period_hours' not in salons:
        op.add_column('salons', sa.Column('cancellation_grace_period_hours', sa.Integer(), nullable=True, server_default='24'))

    indie = {c['name'] for c in insp.get_columns('indie_masters')}
    if 'missed_sessions_advance_payment_threshold' not in indie:
        op.add_column('indie_masters', sa.Column('missed_sessions_advance_payment_threshold', sa.Integer(), nullable=True, server_default='3'))
    if 'missed_sessions_blacklist_threshold' not in indie:
        op.add_column('indie_masters', sa.Column('missed_sessions_blacklist_threshold', sa.Integer(), nullable=True, server_default='5'))
    if 'cancellation_grace_period_hours' not in indie:
        op.add_column('indie_masters', sa.Column('cancellation_grace_period_hours', sa.Integer(), nullable=True, server_default='24'))

    op.execute("UPDATE salons SET missed_sessions_advance_payment_threshold = 3, missed_sessions_blacklist_threshold = 5, cancellation_grace_period_hours = 24")
    op.execute("UPDATE indie_masters SET missed_sessions_advance_payment_threshold = 3, missed_sessions_blacklist_threshold = 5, cancellation_grace_period_hours = 24")


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    indie = {c['name'] for c in insp.get_columns('indie_masters')}
    for col in ('cancellation_grace_period_hours', 'missed_sessions_blacklist_threshold', 'missed_sessions_advance_payment_threshold'):
        if col in indie:
            op.drop_column('indie_masters', col)

    salons = {c['name'] for c in insp.get_columns('salons')}
    for col in ('cancellation_grace_period_hours', 'missed_sessions_blacklist_threshold', 'missed_sessions_advance_payment_threshold'):
        if col in salons:
            op.drop_column('salons', col)
