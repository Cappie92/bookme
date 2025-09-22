"""remove_address_and_working_hours_from_salon

Revision ID: 9ee705fff115
Revises: add_address_field_to_master
Create Date: 2025-08-05 19:22:59.525573

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9ee705fff115'
down_revision: Union[str, None] = 'add_address_field_to_master'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Удаляем поля address и working_hours из таблицы salons
    with op.batch_alter_table('salons') as batch_op:
        batch_op.drop_column('address')
        batch_op.drop_column('working_hours')


def downgrade() -> None:
    # Восстанавливаем поля address и working_hours в таблице salons
    with op.batch_alter_table('salons') as batch_op:
        batch_op.add_column(sa.Column('address', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('working_hours', sa.Text(), nullable=True))
