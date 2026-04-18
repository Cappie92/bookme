"""ensure_service_functions_rows_and_clients_sf

Идемпотентно:
1) Восстанавливает строки в service_functions (если таблица пуста или не хватает id 1–7).
2) Добавляет service_function id=7 («Клиенты») в планы Pro, Premium, AlwaysFree (MASTER).

Revision ID: 20260311_sf_clients
Revises: 20260219_master_restrict
Create Date: 2026-03-11

"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260311_sf_clients"
down_revision: Union[str, None] = "20260219_master_restrict"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Согласовано с 20260128_populate_service_functions_and_plans + 20260205_add_clients_service_function
FUNCTION_ROWS = [
    (1, "booking_page", "Страница бронирования мастера", "FREE", 1),
    (2, "extended_statistics", "Статистика", "SUBSCRIPTION", 3),
    (3, "loyalty_program", "Лояльность", "SUBSCRIPTION", 4),
    (4, "finance_management", "Финансы", "SUBSCRIPTION", 5),
    (5, "client_restrictions", "Стоп-листы и предоплата", "SUBSCRIPTION", 6),
    (6, "custom_domain", "Персональный домен", "SUBSCRIPTION", 7),
    (7, "clients", "Клиенты", "SUBSCRIPTION", 8),
]

def _parse_features(raw) -> dict:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8")
    if isinstance(raw, str):
        raw = raw.strip()
        if not raw:
            return {}
        return json.loads(raw)
    return {}


def upgrade() -> None:
    conn = op.get_bind()
    now = datetime.utcnow().isoformat()

    for fid, name, display_name, ftype, display_order in FUNCTION_ROWS:
        exists = conn.execute(
            sa.text("SELECT 1 FROM service_functions WHERE id = :id"), {"id": fid}
        ).scalar()
        if exists:
            continue
        conn.execute(
            sa.text(
                """
                INSERT INTO service_functions
                (id, name, display_name, description, function_type, display_order, is_active, created_at, updated_at)
                VALUES (:id, :name, :display_name, '', :ftype, :display_order, 1, :now, :now)
                """
            ),
            {
                "id": fid,
                "name": name,
                "display_name": display_name,
                "ftype": ftype,
                "display_order": display_order,
                "now": now,
            },
        )

    rows = conn.execute(
        sa.text(
            """
            SELECT id, features FROM subscription_plans
            WHERE subscription_type = 'MASTER'
              AND name IN ('Pro', 'Premium', 'AlwaysFree')
            """
        )
    ).fetchall()

    for row in rows:
        pid = row[0]
        d = _parse_features(row[1])
        sf = list(d.get("service_functions") or [])
        if 7 not in sf:
            sf.append(7)
            d["service_functions"] = sorted(set(sf))
            conn.execute(
                sa.text("UPDATE subscription_plans SET features = :feat WHERE id = :id"),
                {"feat": json.dumps(d, ensure_ascii=False), "id": pid},
            )


def downgrade() -> None:
    pass
