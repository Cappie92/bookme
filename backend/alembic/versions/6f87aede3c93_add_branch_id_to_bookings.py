"""add_branch_id_to_bookings

Revision ID: 6f87aede3c93
Revises: 9ee705fff115
Create Date: 2025-08-05 19:27:30.749627

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6f87aede3c93'
down_revision: Union[str, None] = '9ee705fff115'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем поле branch_id в таблицу bookings
    with op.batch_alter_table('bookings') as batch_op:
        batch_op.add_column(sa.Column('branch_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_bookings_branch_id', 'salon_branches', ['branch_id'], ['id'])


def downgrade() -> None:
    # Удаляем поле branch_id из таблицы bookings
    with op.batch_alter_table('bookings') as batch_op:
        batch_op.drop_constraint('fk_bookings_branch_id', type_='foreignkey')
        batch_op.drop_column('branch_id')
