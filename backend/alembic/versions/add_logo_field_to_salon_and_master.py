"""add logo field to salon and master

Revision ID: add_logo_field_to_salon_and_master
Revises: add_loyalty_system
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_logo_field_to_salon_and_master'
down_revision = 'add_loyalty_system'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем поле logo в таблицу salons
    op.add_column('salons', sa.Column('logo', sa.String(), nullable=True))
    
    # Добавляем поле logo в таблицу masters
    op.add_column('masters', sa.Column('logo', sa.String(), nullable=True))


def downgrade() -> None:
    # Удаляем поле logo из таблицы salons
    op.drop_column('salons', 'logo')
    
    # Удаляем поле logo из таблицы masters
    op.drop_column('masters', 'logo') 