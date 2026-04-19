"""Add master expenses and booking confirmations tables

Revision ID: 9d61976d31ea
Revises: 20250127_add_updated_at
Create Date: 2025-10-14 19:06:21.763353

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9d61976d31ea'
down_revision: Union[str, None] = '20250127_add_updated_at'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    im = {c['name'] for c in insp.get_columns('indie_masters')}
    for col in ('can_work_independently', 'updated_at', 'is_active'):
        if col in im:
            op.drop_column('indie_masters', col)

    bind = op.get_bind()
    insp = sa.inspect(bind)
    mp = {c['name'] for c in insp.get_columns('moderator_permissions')}
    for name, col in (
        ('can_create_promo_codes', sa.Column('can_create_promo_codes', sa.Boolean(), nullable=True)),
        ('can_view_promo_codes', sa.Column('can_view_promo_codes', sa.Boolean(), nullable=True)),
        ('can_edit_promo_codes', sa.Column('can_edit_promo_codes', sa.Boolean(), nullable=True)),
        ('can_delete_promo_codes', sa.Column('can_delete_promo_codes', sa.Boolean(), nullable=True)),
    ):
        if name not in mp:
            op.add_column('moderator_permissions', col)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    mp = {c['name'] for c in insp.get_columns('moderator_permissions')}
    for col in ('can_delete_promo_codes', 'can_edit_promo_codes', 'can_view_promo_codes', 'can_create_promo_codes'):
        if col in mp:
            op.drop_column('moderator_permissions', col)

    bind = op.get_bind()
    insp = sa.inspect(bind)
    im = {c['name'] for c in insp.get_columns('indie_masters')}
    if 'is_active' not in im:
        op.add_column('indie_masters', sa.Column('is_active', sa.BOOLEAN(), server_default=sa.text('1'), nullable=True))
    if 'updated_at' not in im:
        op.add_column('indie_masters', sa.Column('updated_at', sa.DATETIME(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True))
    if 'can_work_independently' not in im:
        op.add_column('indie_masters', sa.Column('can_work_independently', sa.BOOLEAN(), server_default=sa.text('1'), nullable=True))
