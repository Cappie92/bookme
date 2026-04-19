"""add_phone_verification_fields_only

Revision ID: add_phone_verification_only
Revises: 032ee800b301
Create Date: 2025-07-22 15:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'add_phone_verification_only'
down_revision: Union[str, None] = '032ee800b301'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('users')}
    if 'is_phone_verified' not in cols:
        op.add_column('users', sa.Column('is_phone_verified', sa.Boolean(), nullable=True))
    if 'phone_verification_code' not in cols:
        op.add_column('users', sa.Column('phone_verification_code', sa.String(), nullable=True))
    if 'phone_verification_expires' not in cols:
        op.add_column('users', sa.Column('phone_verification_expires', sa.DateTime(), nullable=True))
    if 'password_reset_code' not in cols:
        op.add_column('users', sa.Column('password_reset_code', sa.String(), nullable=True))
    if 'password_reset_expires' not in cols:
        op.add_column('users', sa.Column('password_reset_expires', sa.DateTime(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    cols = {c['name'] for c in insp.get_columns('users')}
    if 'password_reset_expires' in cols:
        op.drop_column('users', 'password_reset_expires')
    if 'password_reset_code' in cols:
        op.drop_column('users', 'password_reset_code')
    if 'phone_verification_expires' in cols:
        op.drop_column('users', 'phone_verification_expires')
    if 'phone_verification_code' in cols:
        op.drop_column('users', 'phone_verification_code')
    if 'is_phone_verified' in cols:
        op.drop_column('users', 'is_phone_verified')
