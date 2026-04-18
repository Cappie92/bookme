"""remove_subscription_addons

Revision ID: 757589d7d340
Revises: 75be0f58cb4b
Create Date: 2025-12-06 21:08:05.367924

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '757589d7d340'
down_revision: Union[str, None] = '75be0f58cb4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Удаляем поле addons из таблицы subscriptions
    with op.batch_alter_table('subscriptions', schema=None) as batch_op:
        try:
            batch_op.drop_column('addons')
        except Exception:
            pass  # Колонка может не существовать
    
    # Удаляем индексы subscription_addons
    try:
        op.drop_index('idx_subscription_addon_active', table_name='subscription_addons')
    except Exception:
        pass
    try:
        op.drop_index('idx_subscription_addon_type', table_name='subscription_addons')
    except Exception:
        pass
    
    # Удаляем таблицу subscription_addons
    try:
        op.drop_table('subscription_addons')
    except Exception:
        pass


def downgrade() -> None:
    # Восстанавливаем таблицу subscription_addons
    op.create_table('subscription_addons',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('subscription_type', sa.String(), nullable=False),
        sa.Column('price_monthly', sa.Float(), nullable=False),
        sa.Column('price_yearly', sa.Float(), nullable=False),
        sa.Column('feature_key', sa.String(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index('idx_subscription_addon_type', 'subscription_addons', ['subscription_type'])
    op.create_index('idx_subscription_addon_active', 'subscription_addons', ['is_active'])
    
    # Восстанавливаем поле addons в subscriptions
    with op.batch_alter_table('subscriptions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('addons', sa.JSON(), nullable=True))
