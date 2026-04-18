"""MASTER_CANON Stage 3: migrate client_favorites indie_master -> master

- Перевести favorite_type='indie_master' -> 'master'
- master_id = indie_masters.master_id (join по indie_master_id)
- Удалить дубли по (client_id, master_id) — оставить одну запись
- После миграции: favorite_type='indie_master' = 0

Revision ID: 20260216_fav_migrate
Revises: 20260216_constraints
Create Date: 2026-02-16

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


revision: str = "20260216_fav_migrate"
down_revision: Union[str, None] = "20260216_constraints"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Удалить indie favorites, которые станут дублями (уже есть master favorite на того же master_id)
    conn.execute(text("""
        DELETE FROM client_favorites
        WHERE client_favorite_id IN (
            SELECT cf.client_favorite_id
            FROM client_favorites cf
            JOIN indie_masters im ON im.id = cf.indie_master_id AND im.master_id IS NOT NULL
            WHERE cf.favorite_type = 'indie_master'
              AND EXISTS (
                SELECT 1 FROM client_favorites ex
                WHERE ex.client_id = cf.client_id
                  AND ex.favorite_type = 'master'
                  AND ex.master_id = im.master_id
                  AND ex.client_favorite_id != cf.client_favorite_id
              )
        )
    """))

    # 2. Мигрировать оставшиеся indie_master -> master
    # SQLite: UPDATE ... FROM не поддерживается, используем подзапрос
    conn.execute(text("""
        UPDATE client_favorites
        SET favorite_type = 'master',
            master_id = (SELECT im.master_id FROM indie_masters im WHERE im.id = client_favorites.indie_master_id LIMIT 1),
            indie_master_id = NULL
        WHERE favorite_type = 'indie_master'
          AND indie_master_id IN (
            SELECT id FROM indie_masters WHERE master_id IS NOT NULL
          )
    """))

    # 3. Post-check: не должно остаться indie_master
    remaining = conn.execute(
        text("SELECT COUNT(*) FROM client_favorites WHERE favorite_type = 'indie_master'")
    ).scalar()
    if remaining > 0:
        raise RuntimeError(
            f"Post-check failed: {remaining} client_favorites still have favorite_type='indie_master'. "
            "Some indie_master_id may have no master_id."
        )


def downgrade() -> None:
    # Откат: не восстанавливаем indie_master (данные потеряны при миграции).
    # Оставляем только master favorites.
    pass
