"""add_clients_service_function

Добавить платную функцию «Клиенты» (clients) в service_functions.
ID=7 при чистой базе после populate. Идемпотентно: не добавляет, если уже есть.

Revision ID: 20260205_add_clients_sf
Revises: 20260128_populate_sf
Create Date: 2026-02-05

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import text
from datetime import datetime


revision: str = "20260205_add_clients_sf"
down_revision: Union[str, None] = "20260128_booking_owner_ck"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.utcnow().isoformat()

    # Добавляем «Клиенты» только если такой функции ещё нет (по name)
    r = conn.execute(text("SELECT id FROM service_functions WHERE name = 'clients'")).fetchone()
    if r is None:
        # Определяем следующий ID: max(id)+1 или 7 если таблица пуста
        max_id = conn.execute(text("SELECT COALESCE(MAX(id), 0) FROM service_functions")).scalar()
        next_id = max(max_id + 1 if max_id else 7, 7)
        conn.execute(
            text("""
                INSERT INTO service_functions
                (id, name, display_name, description, function_type, display_order, is_active, created_at, updated_at)
                VALUES (:id, 'clients', 'Клиенты', 'Раздел клиентов с метаданными и ограничениями', 'SUBSCRIPTION', :display_order, 1, :now, :now)
            """),
            {"id": next_id, "display_order": 8, "now": now},
        )


def downgrade() -> None:
    # Удаляем функцию clients (опционально, может сломать планы с service_functions=[...,7])
    conn = op.get_bind()
    conn.execute(text("DELETE FROM service_functions WHERE name = 'clients'"))
