"""add_client_salon_notes_table

Revision ID: simple_salon_notes
Revises: 7fadfa330abd
Create Date: 2025-08-31 01:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'simple_salon_notes'
down_revision: Union[str, None] = '7fadfa330abd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'client_salon_notes' not in insp.get_table_names():
        op.create_table('client_salon_notes',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('client_id', sa.Integer(), nullable=False),
            sa.Column('salon_id', sa.Integer(), nullable=False),
            sa.Column('branch_id', sa.Integer(), nullable=True),
            sa.Column('note', sa.String(length=400), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['client_id'], ['users.id'], ),
            sa.ForeignKeyConstraint(['salon_id'], ['salons.id'], ),
            sa.ForeignKeyConstraint(['branch_id'], ['salon_branches.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    idx_names = {ix['name'] for ix in insp.get_indexes('client_salon_notes')}
    for name, cols, unique in (
        ('idx_client_salon_note_client', ['client_id'], False),
        ('idx_client_salon_note_salon', ['salon_id'], False),
        ('idx_client_salon_note_branch', ['branch_id'], False),
        ('idx_client_salon_note_unique', ['client_id', 'salon_id', 'branch_id'], True),
    ):
        if name not in idx_names:
            op.create_index(name, 'client_salon_notes', cols, unique=unique)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'client_salon_notes' not in insp.get_table_names():
        return
    for name in (
        'idx_client_salon_note_unique',
        'idx_client_salon_note_branch',
        'idx_client_salon_note_salon',
        'idx_client_salon_note_client',
    ):
        idx_names = {ix['name'] for ix in insp.get_indexes('client_salon_notes')}
        if name in idx_names:
            op.drop_index(name, table_name='client_salon_notes')
    op.drop_table('client_salon_notes')
