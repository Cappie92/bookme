"""add_branch_manager_invitations_table

Revision ID: f1035797e640
Revises: 21925422f1b0
Create Date: 2025-08-16 13:58:22.959690

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1035797e640'
down_revision: Union[str, None] = '21925422f1b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'branch_manager_invitations' not in insp.get_table_names():
        op.create_table(
            'branch_manager_invitations',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('salon_id', sa.Integer(), nullable=False),
            sa.Column('branch_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('status', sa.Enum('pending', 'accepted', 'declined', name='salonmasterinvitationstatus'), nullable=True),
            sa.Column('message', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['branch_id'], ['salon_branches.id'], ),
            sa.ForeignKeyConstraint(['salon_id'], ['salons.id'], ),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    ix_name = op.f('ix_branch_manager_invitations_id')
    idx_names = {ix['name'] for ix in insp.get_indexes('branch_manager_invitations')}
    if ix_name not in idx_names:
        op.create_index(ix_name, 'branch_manager_invitations', ['id'], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if 'branch_manager_invitations' not in insp.get_table_names():
        return
    ix_name = op.f('ix_branch_manager_invitations_id')
    idx_names = {ix['name'] for ix in insp.get_indexes('branch_manager_invitations')}
    if ix_name in idx_names:
        op.drop_index(ix_name, table_name='branch_manager_invitations')
    op.drop_table('branch_manager_invitations')
