"""add_site_description_and_rating_fields

Revision ID: 4d6542a73038
Revises: b76241251664
Create Date: 2025-01-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4d6542a73038'
down_revision: Union[str, None] = 'b76241251664'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Добавляем поле site_description в таблицу masters
    op.add_column('masters', sa.Column('site_description', sa.Text(), nullable=True))
    
    # Добавляем поле rating в таблицу client_master_notes
    op.add_column('client_master_notes', sa.Column('rating', sa.String(), nullable=True))


def downgrade() -> None:
    # Удаляем поле rating из таблицы client_master_notes
    op.drop_column('client_master_notes', 'rating')
    
    # Удаляем поле site_description из таблицы masters
    op.drop_column('masters', 'site_description')
