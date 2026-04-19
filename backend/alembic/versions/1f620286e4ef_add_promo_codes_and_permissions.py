"""add_promo_codes_and_permissions

Revision ID: 1f620286e4ef
Revises: af5f0540bc06
Create Date: 2025-09-17 00:25:22.381990

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1f620286e4ef'
down_revision: Union[str, None] = 'af5f0540bc06'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    mp = {c['name'] for c in insp.get_columns('moderator_permissions')}
    for name, col in (
        ('can_create_promo_codes', sa.Column('can_create_promo_codes', sa.Boolean(), nullable=True, default=False)),
        ('can_view_promo_codes', sa.Column('can_view_promo_codes', sa.Boolean(), nullable=True, default=False)),
        ('can_edit_promo_codes', sa.Column('can_edit_promo_codes', sa.Boolean(), nullable=True, default=False)),
        ('can_delete_promo_codes', sa.Column('can_delete_promo_codes', sa.Boolean(), nullable=True, default=False)),
    ):
        if name not in mp:
            op.add_column('moderator_permissions', col)

    insp = sa.inspect(bind)
    if 'promo_codes' not in insp.get_table_names():
        op.create_table('promo_codes',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('code', sa.String(length=50), nullable=False),
            sa.Column('max_uses', sa.Integer(), nullable=False),
            sa.Column('used_count', sa.Integer(), nullable=True, default=0),
            sa.Column('expires_at', sa.DateTime(), nullable=True),
            sa.Column('subscription_type', sa.Enum('SALON', 'MASTER', name='subscriptiontype'), nullable=False),
            sa.Column('subscription_duration_days', sa.Integer(), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('created_by', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    if 'promo_codes' in insp.get_table_names():
        idx_names = {ix['name'] for ix in insp.get_indexes('promo_codes')}
        for name, cols in (
            ('idx_promo_codes_code', ['code']),
            ('idx_promo_codes_active', ['is_active']),
            ('idx_promo_codes_expires', ['expires_at']),
            ('idx_promo_codes_type', ['subscription_type']),
        ):
            if name not in idx_names:
                op.create_index(name, 'promo_codes', cols, unique=False)

    insp = sa.inspect(bind)
    if 'promo_code_activations' not in insp.get_table_names():
        op.create_table('promo_code_activations',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('promo_code_id', sa.Integer(), nullable=True),
            sa.Column('user_id', sa.Integer(), nullable=True),
            sa.Column('activated_at', sa.DateTime(), nullable=True),
            sa.Column('subscription_start', sa.DateTime(), nullable=False),
            sa.Column('subscription_end', sa.DateTime(), nullable=False),
            sa.Column('paid_after_expiry', sa.Boolean(), nullable=True, default=False),
            sa.ForeignKeyConstraint(['promo_code_id'], ['promo_codes.id'], ),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    insp = sa.inspect(bind)
    if 'promo_code_activations' in insp.get_table_names():
        idx_names = {ix['name'] for ix in insp.get_indexes('promo_code_activations')}
        for name, cols in (
            ('idx_promo_activations_promo_code', ['promo_code_id']),
            ('idx_promo_activations_user', ['user_id']),
            ('idx_promo_activations_activated_at', ['activated_at']),
        ):
            if name not in idx_names:
                op.create_index(name, 'promo_code_activations', cols, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if 'promo_code_activations' in insp.get_table_names():
        for name in (
            'idx_promo_activations_activated_at',
            'idx_promo_activations_user',
            'idx_promo_activations_promo_code',
        ):
            idx_names = {ix['name'] for ix in insp.get_indexes('promo_code_activations')}
            if name in idx_names:
                op.drop_index(name, table_name='promo_code_activations')
        op.drop_table('promo_code_activations')

    insp = sa.inspect(bind)
    if 'promo_codes' in insp.get_table_names():
        for name in (
            'idx_promo_codes_type',
            'idx_promo_codes_expires',
            'idx_promo_codes_active',
            'idx_promo_codes_code',
        ):
            idx_names = {ix['name'] for ix in insp.get_indexes('promo_codes')}
            if name in idx_names:
                op.drop_index(name, table_name='promo_codes')
        op.drop_table('promo_codes')

    insp = sa.inspect(bind)
    mp = {c['name'] for c in insp.get_columns('moderator_permissions')}
    for col in ('can_delete_promo_codes', 'can_edit_promo_codes', 'can_view_promo_codes', 'can_create_promo_codes'):
        if col in mp:
            op.drop_column('moderator_permissions', col)
