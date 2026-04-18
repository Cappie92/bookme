"""add_freeze_days_to_subscription_plans

Revision ID: add_freeze_days
Revises: recreate_service_functions
Create Date: 2025-01-25 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = 'add_freeze_days'
down_revision: Union[str, None] = 'recreate_service_functions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    
    # Проверяем существование колонок перед добавлением
    inspector = sa.inspect(conn)
    existing_columns = [col['name'] for col in inspector.get_columns('subscription_plans')]
    
    # Добавляем колонки для дней заморозки только если их еще нет
    # SQLite не поддерживает ALTER COLUMN для изменения NOT NULL, поэтому оставляем nullable=True
    # но устанавливаем server_default='0' для значений по умолчанию
    if 'freeze_days_1month' not in existing_columns:
        op.add_column('subscription_plans', sa.Column('freeze_days_1month', sa.Integer(), nullable=True, server_default='0'))
    if 'freeze_days_3months' not in existing_columns:
        op.add_column('subscription_plans', sa.Column('freeze_days_3months', sa.Integer(), nullable=True, server_default='0'))
    if 'freeze_days_6months' not in existing_columns:
        op.add_column('subscription_plans', sa.Column('freeze_days_6months', sa.Integer(), nullable=True, server_default='0'))
    if 'freeze_days_12months' not in existing_columns:
        op.add_column('subscription_plans', sa.Column('freeze_days_12months', sa.Integer(), nullable=True, server_default='0'))
    
    # Миграция данных: переносим значения из features.freeze_days_* в новые поля
    # Получаем все планы
    result = conn.execute(text("SELECT id, features FROM subscription_plans"))
    plans = result.fetchall()
    
    for plan_id, features_json in plans:
        if features_json:
            import json
            try:
                features = json.loads(features_json) if isinstance(features_json, str) else features_json
                
                # Извлекаем значения из features
                freeze_1m = features.get('freeze_days_1m', features.get('freeze_days_3m', 0))
                freeze_3m = features.get('freeze_days_3m', 0)
                freeze_6m = features.get('freeze_days_6m', 0)
                freeze_12m = features.get('freeze_days_12m', 0)
                
                # Обновляем план
                conn.execute(
                    text("""
                        UPDATE subscription_plans 
                        SET freeze_days_1month = :freeze_1m,
                            freeze_days_3months = :freeze_3m,
                            freeze_days_6months = :freeze_6m,
                            freeze_days_12months = :freeze_12m
                        WHERE id = :plan_id
                    """),
                    {
                        'freeze_1m': freeze_1m,
                        'freeze_3m': freeze_3m,
                        'freeze_6m': freeze_6m,
                        'freeze_12m': freeze_12m,
                        'plan_id': plan_id
                    }
                )
            except (json.JSONDecodeError, TypeError):
                # Если не удалось распарсить, оставляем значения по умолчанию (0)
                pass
    
    # Для SQLite не нужно изменять колонки на NOT NULL - оставляем nullable=True с server_default='0'
    # Это нормально для SQLite, так как server_default обеспечит значения по умолчанию


def downgrade() -> None:
    # Удаляем колонки
    op.drop_column('subscription_plans', 'freeze_days_12months')
    op.drop_column('subscription_plans', 'freeze_days_6months')
    op.drop_column('subscription_plans', 'freeze_days_3months')
    op.drop_column('subscription_plans', 'freeze_days_1month')

