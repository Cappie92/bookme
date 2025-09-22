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
    # Добавляем поле domain в таблицу masters
    op.add_column('masters', sa.Column('domain', sa.String(), nullable=True))
    op.create_unique_constraint('uq_masters_domain', 'masters', ['domain'])


def downgrade() -> None:
    # Удаляем поле domain из таблицы masters
    op.drop_constraint('uq_masters_domain', 'masters', type_='unique')
    op.drop_column('masters', 'domain') 