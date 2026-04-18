"""add_service_functions_table

Revision ID: bbed650921e4
Revises: 311b58ff9b60
Create Date: 2025-11-27 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite


# revision identifiers, used by Alembic.
revision: str = 'bbed650921e4'
down_revision: Union[str, None] = '311b58ff9b60'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Проверяем существование таблицы перед созданием
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()
    
    # Создаем таблицу service_functions
    if 'service_functions' not in existing_tables:
        op.create_table(
            'service_functions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('function_type', sa.String(), nullable=False),  # Enum type in models
            sa.Column('is_active', sa.Boolean(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_service_functions_id'), 'service_functions', ['id'], unique=False)
        
        # Добавляем примерные функции
        op.execute("""
            INSERT INTO service_functions (name, description, function_type, is_active, created_at, updated_at)
            VALUES
            ('Бронирование онлайн', 'Возможность бронирования услуг через веб-интерфейс', 'FREE', 1, datetime('now'), datetime('now')),
            ('Уведомления по SMS', 'Отправка SMS-уведомлений клиентам и мастерам', 'SUBSCRIPTION', 1, datetime('now'), datetime('now')),
            ('Уведомления по Email', 'Отправка email-уведомлений клиентам и мастерам', 'FREE', 1, datetime('now'), datetime('now')),
            ('Аналитика и отчеты', 'Детальная аналитика по записям и доходам', 'SUBSCRIPTION', 1, datetime('now'), datetime('now')),
            ('Интеграция с календарем', 'Синхронизация с Google Calendar и другими календарями', 'SUBSCRIPTION', 1, datetime('now'), datetime('now')),
            ('Маркетинговые рассылки', 'Массовые рассылки клиентам с предложениями', 'VOLUME_BASED', 1, datetime('now'), datetime('now')),
            ('Персональная страница мастера', 'Создание персональной страницы для записи клиентов', 'SUBSCRIPTION', 1, datetime('now'), datetime('now')),
            ('Управление клиентской базой', 'CRM-функционал для управления клиентами', 'SUBSCRIPTION', 1, datetime('now'), datetime('now'))
        """)


def downgrade() -> None:
    op.drop_index(op.f('ix_service_functions_id'), table_name='service_functions')
    op.drop_table('service_functions')
