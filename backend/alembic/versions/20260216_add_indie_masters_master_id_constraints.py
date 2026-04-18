"""add constraints to indie_masters.master_id (MASTER_CANON Stage 1.3)

Post-check: null_count=0, 1:1 violations=0.
Добавить FK, NOT NULL, UNIQUE.

Revision ID: 20260216_constraints
Revises: 20260216_backfill
Create Date: 2026-02-16

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = "20260216_constraints"
down_revision: Union[str, None] = "20260216_backfill"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _post_check(conn) -> None:
    null_count = conn.execute(text("SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL")).scalar()
    if null_count > 0:
        raise RuntimeError(f"Post-check failed: {null_count} indie_masters have NULL master_id")
    viol = conn.execute(
        text("""
            SELECT master_id, COUNT(*) as cnt FROM indie_masters
            WHERE master_id IS NOT NULL GROUP BY master_id HAVING COUNT(*) > 1
        """)
    ).fetchall()
    if viol:
        raise RuntimeError(
            f"Post-check failed: 1:1 violated. master_ids with >1 indie: {[r[0] for r in viol]}. "
            "Do NOT add UNIQUE. See docs 0.H."
        )


def upgrade() -> None:
    conn = op.get_bind()
    _post_check(conn)

    # NOT NULL: batch_alter_table (SQLite recreates table)
    with op.batch_alter_table("indie_masters", schema=None) as batch_op:
        batch_op.alter_column(
            "master_id",
            existing_type=sa.INTEGER(),
            nullable=False,
            existing_nullable=True,
        )

    # UNIQUE: replace non-unique index with unique
    op.drop_index("ix_indie_masters_master_id", table_name="indie_masters")
    op.create_index(
        "uq_indie_masters_master_id",
        "indie_masters",
        ["master_id"],
        unique=True,
    )

    # FK: SQLite cannot add FK to existing table; add to models.py for new DBs


def downgrade() -> None:
    op.drop_index("uq_indie_masters_master_id", table_name="indie_masters")
    op.create_index("ix_indie_masters_master_id", "indie_masters", ["master_id"], unique=False)
    with op.batch_alter_table("indie_masters", schema=None) as batch_op:
        batch_op.alter_column(
            "master_id",
            existing_type=sa.INTEGER(),
            nullable=True,
            existing_nullable=False,
        )
