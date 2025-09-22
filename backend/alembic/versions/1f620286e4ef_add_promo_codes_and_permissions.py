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
    # Добавляем поля для промо-кодов в moderator_permissions
    op.add_column('moderator_permissions', sa.Column('can_create_promo_codes', sa.Boolean(), nullable=True, default=False))
    op.add_column('moderator_permissions', sa.Column('can_view_promo_codes', sa.Boolean(), nullable=True, default=False))
    op.add_column('moderator_permissions', sa.Column('can_edit_promo_codes', sa.Boolean(), nullable=True, default=False))
    op.add_column('moderator_permissions', sa.Column('can_delete_promo_codes', sa.Boolean(), nullable=True, default=False))
    
    # Создаем таблицу promo_codes
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
    op.create_index('idx_promo_codes_code', 'promo_codes', ['code'], unique=False)
    op.create_index('idx_promo_codes_active', 'promo_codes', ['is_active'], unique=False)
    op.create_index('idx_promo_codes_expires', 'promo_codes', ['expires_at'], unique=False)
    op.create_index('idx_promo_codes_type', 'promo_codes', ['subscription_type'], unique=False)
    
    # Создаем таблицу promo_code_activations
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
    op.create_index('idx_promo_activations_promo_code', 'promo_code_activations', ['promo_code_id'], unique=False)
    op.create_index('idx_promo_activations_user', 'promo_code_activations', ['user_id'], unique=False)
    op.create_index('idx_promo_activations_activated_at', 'promo_code_activations', ['activated_at'], unique=False)


def downgrade() -> None:
    # Удаляем таблицы
    op.drop_index('idx_promo_activations_activated_at', table_name='promo_code_activations')
    op.drop_index('idx_promo_activations_user', table_name='promo_code_activations')
    op.drop_index('idx_promo_activations_promo_code', table_name='promo_code_activations')
    op.drop_table('promo_code_activations')
    op.drop_index('idx_promo_codes_type', table_name='promo_codes')
    op.drop_index('idx_promo_codes_expires', table_name='promo_codes')
    op.drop_index('idx_promo_codes_active', table_name='promo_codes')
    op.drop_index('idx_promo_codes_code', table_name='promo_codes')
    op.drop_table('promo_codes')
    
    # Удаляем поля из moderator_permissions
    op.drop_column('moderator_permissions', 'can_delete_promo_codes')
    op.drop_column('moderator_permissions', 'can_edit_promo_codes')
    op.drop_column('moderator_permissions', 'can_view_promo_codes')
    op.drop_column('moderator_permissions', 'can_create_promo_codes')
