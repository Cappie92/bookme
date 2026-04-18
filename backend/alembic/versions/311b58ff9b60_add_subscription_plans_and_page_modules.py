"""add_subscription_plans_and_page_modules

Revision ID: 311b58ff9b60
Revises: 6cdcf96609b1
Create Date: 2025-11-25 23:40:08.226486

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '311b58ff9b60'
down_revision: Union[str, None] = '6cdcf96609b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Проверяем существование таблиц перед созданием
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()
    
    # Создаем таблицу subscription_plans
    if 'subscription_plans' not in existing_tables:
        op.create_table(
        'subscription_plans',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('subscription_type', sa.String(), nullable=False),
        sa.Column('price_monthly', sa.Float(), nullable=False),
        sa.Column('price_yearly', sa.Float(), nullable=False),
        sa.Column('features', sa.JSON(), nullable=True),
        sa.Column('limits', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
        op.create_index('idx_subscription_plan_type', 'subscription_plans', ['subscription_type'])
        op.create_index('idx_subscription_plan_active', 'subscription_plans', ['is_active'])
    
    # Создаем таблицу subscription_addons
    if 'subscription_addons' not in existing_tables:
        op.create_table(
        'subscription_addons',
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
        sa.PrimaryKeyConstraint('id')
    )
        op.create_index('idx_subscription_addon_type', 'subscription_addons', ['subscription_type'])
        op.create_index('idx_subscription_addon_active', 'subscription_addons', ['is_active'])
    
    # Создаем таблицу master_page_modules
    if 'master_page_modules' not in existing_tables:
        op.create_table(
        'master_page_modules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('master_id', sa.Integer(), nullable=False),
        sa.Column('module_type', sa.String(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=True),
        sa.Column('config', sa.JSON(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['master_id'], ['masters.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
        op.create_index('idx_master_page_module_master', 'master_page_modules', ['master_id'])
        op.create_index('idx_master_page_module_position', 'master_page_modules', ['master_id', 'position'])
    
    # Обновляем таблицу subscriptions: добавляем plan_id и addons
    # Проверяем, существуют ли уже колонки
    existing_columns = [col['name'] for col in inspector.get_columns('subscriptions')]
    
    with op.batch_alter_table('subscriptions', schema=None) as batch_op:
        if 'plan_id' not in existing_columns:
            batch_op.add_column(sa.Column('plan_id', sa.Integer(), nullable=True))
        if 'addons' not in existing_columns:
            batch_op.add_column(sa.Column('addons', sa.JSON(), nullable=True))
        # Проверяем существование foreign key перед созданием
        try:
            batch_op.create_foreign_key('fk_subscriptions_plan_id', 'subscription_plans', ['plan_id'], ['id'])
        except Exception:
            pass  # Foreign key уже существует или таблица subscription_plans не существует


def downgrade() -> None:
    # Удаляем изменения из subscriptions
    with op.batch_alter_table('subscriptions', schema=None) as batch_op:
        batch_op.drop_constraint('fk_subscriptions_plan_id', type_='foreignkey')
        batch_op.drop_column('addons')
        batch_op.drop_column('plan_id')
    
    # Удаляем таблицу master_page_modules
    op.drop_index('idx_master_page_module_position', table_name='master_page_modules')
    op.drop_index('idx_master_page_module_master', table_name='master_page_modules')
    op.drop_table('master_page_modules')
    
    # Удаляем таблицу subscription_addons
    op.drop_index('idx_subscription_addon_active', table_name='subscription_addons')
    op.drop_index('idx_subscription_addon_type', table_name='subscription_addons')
    op.drop_table('subscription_addons')
    
    # Удаляем таблицу subscription_plans
    op.drop_index('idx_subscription_plan_active', table_name='subscription_plans')
    op.drop_index('idx_subscription_plan_type', table_name='subscription_plans')
    op.drop_table('subscription_plans')
