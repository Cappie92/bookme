"""make_salon_id_nullable_in_client_master_notes

Revision ID: 6cdcf96609b1
Revises: 4d6542a73038
Create Date: 2025-01-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6cdcf96609b1'
down_revision: Union[str, None] = '4d6542a73038'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Делаем salon_id nullable в таблице client_master_notes
    # SQLite не поддерживает ALTER COLUMN напрямую, используем batch_alter_table
    with op.batch_alter_table('client_master_notes', schema=None) as batch_op:
        batch_op.alter_column('salon_id',
                             existing_type=sa.Integer(),
                             nullable=True)


def downgrade() -> None:
    # Возвращаем salon_id как not nullable
    # ВНИМАНИЕ: Это может вызвать ошибку, если есть записи с null salon_id
    with op.batch_alter_table('client_master_notes', schema=None) as batch_op:
        batch_op.alter_column('salon_id',
                             existing_type=sa.Integer(),
                             nullable=False)
