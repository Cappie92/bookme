"""add_display_fields_to_plans_and_functions

Revision ID: add_display_fields
Revises: update_subscriptions_columns
Create Date: 2025-01-28 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = 'add_display_fields'
down_revision = 'update_subscriptions_columns'
branch_labels = None
depends_on = None


def upgrade():
    # Добавляем display_name в subscription_plans
    try:
        op.add_column('subscription_plans', sa.Column('display_name', sa.String(), nullable=True))
    except Exception as e:
        print(f"Колонка display_name уже существует в subscription_plans: {e}")
    
    # Заполняем display_name = name для существующих планов
    try:
        conn = op.get_bind()
        conn.execute(text("UPDATE subscription_plans SET display_name = name WHERE display_name IS NULL"))
    except Exception as e:
        print(f"Ошибка при заполнении display_name в subscription_plans: {e}")
    
    # Добавляем display_name в service_functions
    try:
        op.add_column('service_functions', sa.Column('display_name', sa.String(), nullable=True))
    except Exception as e:
        print(f"Колонка display_name уже существует в service_functions: {e}")
    
    # Добавляем display_order в service_functions
    try:
        op.add_column('service_functions', sa.Column('display_order', sa.Integer(), nullable=True, server_default='0'))
    except Exception as e:
        print(f"Колонка display_order уже существует в service_functions: {e}")
    
    # Заполняем display_name = name и display_order = id для существующих service_functions
    try:
        conn = op.get_bind()
        conn.execute(text("UPDATE service_functions SET display_name = name WHERE display_name IS NULL"))
        conn.execute(text("UPDATE service_functions SET display_order = id WHERE display_order IS NULL OR display_order = 0"))
    except Exception as e:
        print(f"Ошибка при заполнении display_name и display_order в service_functions: {e}")


def downgrade():
    # Удаляем добавленные колонки
    try:
        op.drop_column('service_functions', 'display_order')
    except Exception as e:
        print(f"Ошибка при удалении display_order: {e}")
    
    try:
        op.drop_column('service_functions', 'display_name')
    except Exception as e:
        print(f"Ошибка при удалении display_name из service_functions: {e}")
    
    try:
        op.drop_column('subscription_plans', 'display_name')
    except Exception as e:
        print(f"Ошибка при удалении display_name из subscription_plans: {e}")

