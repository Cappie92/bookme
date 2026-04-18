"""add use_photo_as_logo field to master

Revision ID: add_use_photo_as_logo_field
Revises: add_domain_field_to_masters
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_use_photo_as_logo_field'
down_revision = 'add_domain_field_to_masters'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Добавляем поле use_photo_as_logo в таблицу masters
    op.add_column('masters', sa.Column('use_photo_as_logo', sa.Boolean(), nullable=True, default=False))


def downgrade() -> None:
    # Удаляем поле use_photo_as_logo из таблицы masters
    op.drop_column('masters', 'use_photo_as_logo') 