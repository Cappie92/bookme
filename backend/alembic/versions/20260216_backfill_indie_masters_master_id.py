"""backfill indie_masters.master_id (MASTER_CANON Stage 1.2)

Заполнить master_id по user_id. Создать Master для IndieMaster без Master.
Без матчей по имени. Стабильный ключ: user_id.

Revision ID: 20260216_backfill
Revises: 20260216_bridge
Create Date: 2026-02-16

"""
from typing import Sequence, Union
from datetime import datetime
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.engine import Connection


revision: str = "20260216_backfill"
down_revision: Union[str, None] = "20260216_bridge"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _run_backfill(conn: Connection) -> None:
    """Backfill indie_masters.master_id. Create Master if missing."""
    total = conn.execute(text("SELECT COUNT(*) FROM indie_masters")).scalar()
    linked = 0
    created = 0

    # 1) Link existing: indie_masters with user_id -> masters with same user_id
    r = conn.execute(
        text("""
            UPDATE indie_masters
            SET master_id = (SELECT m.id FROM masters m WHERE m.user_id = indie_masters.user_id LIMIT 1)
            WHERE user_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM masters m WHERE m.user_id = indie_masters.user_id)
        """)
    )
    linked = r.rowcount

    # 2) Create Master for IndieMaster without Master (user_id exists, User exists)
    rows = conn.execute(
        text("""
            SELECT im.id AS indie_id, im.user_id, im.bio, im.experience_years, im.domain,
                   im.address, im.city, im.timezone
            FROM indie_masters im
            WHERE im.user_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM users u WHERE u.id = im.user_id)
              AND NOT EXISTS (SELECT 1 FROM masters m WHERE m.user_id = im.user_id)
              AND im.master_id IS NULL
        """)
    ).fetchall()

    for row in rows:
        indie_id, user_id, bio, exp, domain, addr, city, tz = (
            row.indie_id, row.user_id, row.bio, row.experience_years, row.domain,
            row.address, row.city, row.timezone
        )
        # Check domain conflict
        domain_val = domain
        if domain_val:
            exists = conn.execute(
                text("SELECT 1 FROM masters WHERE domain = :d"),
                {"d": domain_val}
            ).fetchone()
            if exists:
                domain_val = None  # Conflict, use NULL

        conn.execute(
            text("""
                INSERT INTO masters (user_id, can_work_independently, can_work_in_salon,
                    bio, experience_years, domain, address, city, timezone,
                    background_color, timezone_confirmed, created_at)
                VALUES (:user_id, 1, 1, :bio, :exp, :domain, :addr, :city, :tz,
                    '#ffffff', 0, :now)
            """),
            {
                "user_id": user_id,
                "bio": bio,
                "exp": exp,
                "domain": domain_val,
                "addr": addr,
                "city": city or "Москва",
                "tz": tz or "Europe/Moscow",
                "now": datetime.utcnow().isoformat(),
            },
        )
        master_id = conn.execute(text("SELECT last_insert_rowid()")).scalar()
        conn.execute(
            text("UPDATE indie_masters SET master_id = :mid WHERE id = :iid"),
            {"mid": master_id, "iid": indie_id},
        )
        created += 1

    # 3) Final link pass for any remaining (e.g. created in step 2)
    r2 = conn.execute(
        text("""
            UPDATE indie_masters
            SET master_id = (SELECT m.id FROM masters m WHERE m.user_id = indie_masters.user_id LIMIT 1)
            WHERE user_id IS NOT NULL AND master_id IS NULL
        """)
    )
    linked += r2.rowcount

    null_count = conn.execute(text("SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL")).scalar()
    if null_count > 0:
        raise RuntimeError(
            f"Backfill incomplete: {null_count} indie_masters still have NULL master_id. "
            "Total={}, linked={}, created={}".format(total, linked, created)
        )

    print(f"[MASTER_CANON] Backfill: indie_masters total={total}, linked={linked}, created={created}, null_remaining=0")


def upgrade() -> None:
    conn = op.get_bind()
    _run_backfill(conn)


def downgrade() -> None:
    op.execute(text("UPDATE indie_masters SET master_id = NULL"))
