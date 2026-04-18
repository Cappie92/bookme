"""populate_service_functions_and_plans

Восстановить service_functions (если пусто) и service_functions в планах.
Фиксит "Нет доступных функций" в админке и has_*_access=false для Pro.

Revision ID: 20260128_populate_sf
Revises: 20260128_reason_dsc
Create Date: 2026-01-28

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import text
from datetime import datetime


revision: str = "20260128_populate_sf"
down_revision: Union[str, None] = "20260128_reason_dsc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FUNCTIONS = [
    (1, "booking_page", "Страница бронирования мастера", "FREE", 1),
    (2, "extended_statistics", "Статистика", "SUBSCRIPTION", 3),
    (3, "loyalty_program", "Лояльность", "SUBSCRIPTION", 4),
    (4, "finance_management", "Финансы", "SUBSCRIPTION", 5),
    (5, "client_restrictions", "Стоп-листы и предоплата", "SUBSCRIPTION", 6),
    (6, "custom_domain", "Персональный домен", "SUBSCRIPTION", 7),
]

PLAN_SF = {
    "Free": [1],
    "Basic": [1, 6],
    "Standart": [1, 6, 2, 5],
    "Standard": [1, 6, 2, 5],
    "Pro": [1, 2, 3, 4, 5, 6],
    "Premium": [1, 2, 3, 4, 5, 6],
}


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.utcnow().isoformat()

    # 1) Если service_functions пуста — вставить 6 функций
    r = conn.execute(text("SELECT count(*) FROM service_functions")).scalar()
    if r == 0:
        for fid, name, display_name, ftype, display_order in FUNCTIONS:
            conn.execute(
                text("""
                    INSERT OR IGNORE INTO service_functions
                    (id, name, display_name, description, function_type, display_order, is_active, created_at, updated_at)
                    VALUES (:id, :name, :display_name, :desc, :ftype, :display_order, 1, :now, :now)
                """),
                {
                    "id": fid,
                    "name": name,
                    "display_name": display_name,
                    "desc": "",
                    "ftype": ftype,
                    "display_order": display_order,
                    "now": now,
                },
            )

    # 2) Обновить service_functions в планах
    for plan_name, sf_ids in PLAN_SF.items():
        sf_json = "[" + ",".join(str(i) for i in sf_ids) + "]"
        conn.execute(
            text("""
                UPDATE subscription_plans
                SET features = json_set(COALESCE(features, '{}'), '$.service_functions', json(:sf))
                WHERE subscription_type = 'MASTER' AND name = :plan_name
            """),
            {"sf": sf_json, "plan_name": plan_name},
        )


def downgrade() -> None:
    pass  # Не откатываем данные
