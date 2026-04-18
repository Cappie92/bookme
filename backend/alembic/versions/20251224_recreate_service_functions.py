"""recreate_service_functions

Revision ID: recreate_service_functions
Revises: add_display_fields
Create Date: 2025-12-24 23:15:06.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from datetime import datetime


# revision identifiers, used by Alembic.
revision: str = 'recreate_service_functions'
down_revision: Union[str, None] = '8247ae6dd875'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    
    # Удаляем все существующие service_functions
    conn.execute(text("DELETE FROM service_functions"))
    
    # Сбрасываем автоинкремент (для SQLite)
    try:
        conn.execute(text("DELETE FROM sqlite_sequence WHERE name='service_functions'"))
    except Exception:
        pass  # Может не быть таблицы sqlite_sequence
    
    # Создаем новые service_functions
    now = datetime.utcnow().isoformat()
    
    new_functions = [
        {
            "id": 1,
            "name": "booking_page",
            "display_name": "Страница бронирования мастера",
            "description": "Базовая функция страницы бронирования мастера",
            "function_type": "FREE",
            "display_order": 1,
            "is_active": True
        },
        {
            "id": 2,
            "name": "extended_statistics",
            "display_name": "Статистика",
            "description": "Расширенная статистика с детальной аналитикой",
            "function_type": "SUBSCRIPTION",
            "display_order": 3,
            "is_active": True
        },
        {
            "id": 3,
            "name": "loyalty_program",
            "display_name": "Лояльность",
            "description": "Программа лояльности с баллами и скидками",
            "function_type": "SUBSCRIPTION",
            "display_order": 4,
            "is_active": True
        },
        {
            "id": 4,
            "name": "finance_management",
            "display_name": "Финансы",
            "description": "Управление финансами и учет доходов",
            "function_type": "SUBSCRIPTION",
            "display_order": 5,
            "is_active": True
        },
        {
            "id": 5,
            "name": "client_restrictions",
            "display_name": "Стоп-листы и предоплата",
            "description": "Настройка стоп-листов клиентов и предоплаты",
            "function_type": "SUBSCRIPTION",
            "display_order": 6,
            "is_active": True
        },
        {
            "id": 6,
            "name": "custom_domain",
            "display_name": "Персональный домен",
            "description": "Возможность редактирования персонального домена",
            "function_type": "SUBSCRIPTION",
            "display_order": 7,
            "is_active": True
        }
    ]
    
    # Вставляем новые функции
    for func in new_functions:
        conn.execute(text("""
            INSERT INTO service_functions 
            (id, name, display_name, description, function_type, display_order, is_active, created_at, updated_at)
            VALUES 
            (:id, :name, :display_name, :description, :function_type, :display_order, :is_active, :created_at, :updated_at)
        """), {
            "id": func["id"],
            "name": func["name"],
            "display_name": func["display_name"],
            "description": func["description"],
            "function_type": func["function_type"],
            "display_order": func["display_order"],
            "is_active": func["is_active"],
            "created_at": now,
            "updated_at": now
        })
    
    # Очищаем service_functions в существующих планах (пользователь сам проставит через админку)
    # Обновляем только планы типа MASTER
    conn.execute(text("""
        UPDATE subscription_plans 
        SET features = json_set(features, '$.service_functions', json('[]'))
        WHERE subscription_type = 'MASTER'
    """))


def downgrade() -> None:
    # В downgrade можно восстановить старые функции, но это сложно
    # Поэтому просто оставляем пустым или восстанавливаем из бэкапа
    pass

