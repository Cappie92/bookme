"""add_tax_rates_table

Revision ID: b6752271cbca
Revises: 9d61976d31ea
Create Date: 2025-10-16 22:11:09.954903

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6752271cbca'
down_revision: Union[str, None] = '9d61976d31ea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Создаем таблицу налоговых ставок
    op.create_table('tax_rates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('master_id', sa.Integer(), nullable=False),
        sa.Column('rate', sa.Float(), nullable=False),
        sa.Column('effective_from_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['master_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Создаем индексы
    op.create_index('idx_tax_rates_master', 'tax_rates', ['master_id'], unique=False)
    op.create_index('idx_tax_rates_date', 'tax_rates', ['effective_from_date'], unique=False)


def downgrade() -> None:
    # Удаляем индексы
    op.drop_index('idx_tax_rates_date', table_name='tax_rates')
    op.drop_index('idx_tax_rates_master', table_name='tax_rates')
    
    # Удаляем таблицу
    op.drop_table('tax_rates')
