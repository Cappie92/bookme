"""add master_id to client_restrictions for master-only mode

Revision ID: 20260219_master_restrict
Revises: 20260216_fav_migrate
Create Date: 2026-02-19

Master-only: restrictions belong to master_id (masters.id).
Legacy: indie_master_id (indie_masters.id) remains for LEGACY_INDIE_MODE=1.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '20260219_master_restrict'
down_revision: Union[str, None] = '20260216_fav_migrate'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('client_restrictions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('master_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_client_restrictions_master_id',
            'masters',
            ['master_id'],
            ['id']
        )
        batch_op.create_index('idx_client_restriction_master', ['master_id'], unique=False)
    # Partial unique index (SQLite 3.8+)
    op.execute("""
        CREATE UNIQUE INDEX idx_client_restriction_unique_master
        ON client_restrictions (master_id, client_phone, restriction_type)
        WHERE master_id IS NOT NULL
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_client_restriction_unique_master")
    with op.batch_alter_table('client_restrictions', schema=None) as batch_op:
        batch_op.drop_index('idx_client_restriction_master', if_exists=True)
        batch_op.drop_constraint('fk_client_restrictions_master_id', type_='foreignkey')
        batch_op.drop_column('master_id')
