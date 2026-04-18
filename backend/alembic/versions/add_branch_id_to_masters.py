"""add_branch_id_to_masters

Revision ID: add_branch_id_to_masters
Revises: 4c65d5480ce3
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_branch_id_to_masters'
down_revision = '6f87aede3c93'
branch_labels = None
depends_on = None


def upgrade():
    # Добавляем поле branch_id в таблицу masters
    with op.batch_alter_table('masters', schema=None) as batch_op:
        batch_op.add_column(sa.Column('branch_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_masters_branch_id', 'salon_branches', ['branch_id'], ['id'])


def downgrade():
    # Удаляем поле branch_id из таблицы masters
    with op.batch_alter_table('masters', schema=None) as batch_op:
        batch_op.drop_constraint('fk_masters_branch_id', type_='foreignkey')
        batch_op.drop_column('branch_id') 