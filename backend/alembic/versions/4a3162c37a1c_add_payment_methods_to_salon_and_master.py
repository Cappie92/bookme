"""add_payment_methods_to_salon_and_master

Revision ID: 4a3162c37a1c
Revises: 6732f2b2ea12
Create Date: 2025-08-16 16:04:08.716204

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4a3162c37a1c'
down_revision: Union[str, None] = '6732f2b2ea12'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    salons = {c['name'] for c in insp.get_columns('salons')}
    if 'payment_on_visit' not in salons:
        op.add_column('salons', sa.Column('payment_on_visit', sa.Boolean(), nullable=True, server_default='1'))
    if 'payment_advance' not in salons:
        op.add_column('salons', sa.Column('payment_advance', sa.Boolean(), nullable=True, server_default='0'))

    indie = {c['name'] for c in insp.get_columns('indie_masters')}
    if 'payment_on_visit' not in indie:
        op.add_column('indie_masters', sa.Column('payment_on_visit', sa.Boolean(), nullable=True, server_default='1'))
    if 'payment_advance' not in indie:
        op.add_column('indie_masters', sa.Column('payment_advance', sa.Boolean(), nullable=True, server_default='0'))

    bookings = {c['name'] for c in insp.get_columns('bookings')}
    if 'payment_method' not in bookings:
        op.add_column('bookings', sa.Column('payment_method', sa.String(), nullable=True))
    if 'payment_deadline' not in bookings:
        op.add_column('bookings', sa.Column('payment_deadline', sa.DateTime(), nullable=True))
    if 'payment_amount' not in bookings:
        op.add_column('bookings', sa.Column('payment_amount', sa.Float(), nullable=True))
    if 'is_paid' not in bookings:
        op.add_column('bookings', sa.Column('is_paid', sa.Boolean(), nullable=True, server_default='0'))

    op.execute("UPDATE salons SET payment_on_visit = 1, payment_advance = 0 WHERE payment_on_visit IS NULL")
    op.execute("UPDATE indie_masters SET payment_on_visit = 1, payment_advance = 0 WHERE payment_on_visit IS NULL")
    op.execute("UPDATE bookings SET is_paid = 0 WHERE is_paid IS NULL")


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    bookings = {c['name'] for c in insp.get_columns('bookings')}
    for col in ('is_paid', 'payment_amount', 'payment_deadline', 'payment_method'):
        if col in bookings:
            op.drop_column('bookings', col)

    indie = {c['name'] for c in insp.get_columns('indie_masters')}
    for col in ('payment_advance', 'payment_on_visit'):
        if col in indie:
            op.drop_column('indie_masters', col)

    salons = {c['name'] for c in insp.get_columns('salons')}
    for col in ('payment_advance', 'payment_on_visit'):
        if col in salons:
            op.drop_column('salons', col)
