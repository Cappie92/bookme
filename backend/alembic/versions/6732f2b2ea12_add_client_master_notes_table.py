"""add_client_master_notes_table

Revision ID: 6732f2b2ea12
Revises: 19b2bb2ced93
Create Date: 2025-08-16 15:29:25.030964

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6732f2b2ea12'
down_revision: Union[str, None] = '19b2bb2ced93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'client_master_notes' not in insp.get_table_names():
        op.create_table('client_master_notes',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('client_id', sa.Integer(), nullable=False),
            sa.Column('master_id', sa.Integer(), nullable=False),
            sa.Column('salon_id', sa.Integer(), nullable=False),
            sa.Column('note', sa.String(length=400), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['client_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['master_id'], ['masters.id'], ),
            sa.ForeignKeyConstraint(['salon_id'], ['salons.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    idx_names = {ix['name'] for ix in insp.get_indexes('client_master_notes')}
    for name, cols, unique in (
        ('idx_client_master_note_client', ['client_id'], False),
        ('idx_client_master_note_master', ['master_id'], False),
        ('idx_client_master_note_salon', ['salon_id'], False),
        ('idx_client_master_note_unique', ['client_id', 'master_id', 'salon_id'], True),
    ):
        if name not in idx_names:
            op.create_index(name, 'client_master_notes', cols, unique=unique)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'client_master_notes' not in insp.get_table_names():
        return
    for name in (
        'idx_client_master_note_unique',
        'idx_client_master_note_salon',
        'idx_client_master_note_master',
        'idx_client_master_note_client',
    ):
        idx_names = {ix['name'] for ix in insp.get_indexes('client_master_notes')}
        if name in idx_names:
            op.drop_index(name, table_name='client_master_notes')
    op.drop_table('client_master_notes')
