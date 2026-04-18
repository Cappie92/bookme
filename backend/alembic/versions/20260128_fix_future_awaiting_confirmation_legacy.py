"""fix_future_awaiting_confirmation_legacy

Legacy: будущие записи со статусом awaiting_confirmation (от старого pre-visit confirm)
переводим в confirmed. "На подтверждение" только для post-visit (прошлые записи).

Revision ID: 20260128_fix_future_aw
Revises: 20260128_populate_sf
Create Date: 2026-01-28

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = "20260128_fix_future_aw"
down_revision: Union[str, None] = "20260128_populate_sf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Будущие записи с awaiting_confirmation → confirmed (legacy pre-visit confirm)
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        conn.execute(
            text(
                "UPDATE bookings SET status = 'confirmed' "
                "WHERE status = 'awaiting_confirmation' AND start_time > datetime('now')"
            )
        )
    else:
        conn.execute(
            text(
                "UPDATE bookings SET status = 'confirmed' "
                "WHERE status = 'awaiting_confirmation' AND start_time > NOW()"
            )
        )


def downgrade() -> None:
    # Не откатываем: не знаем, какие именно были legacy. Оставляем как есть.
    pass
