"""add bookings.public_reference

Revision ID: 20260401_booking_pubref
Revises: 20260330_addr_detail
Create Date: 2026-04-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

revision: str = "20260401_booking_pubref"
down_revision: Union[str, None] = "20260330_addr_detail"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("bookings")}
    if "public_reference" not in cols:
        op.add_column(
            "bookings",
            sa.Column("public_reference", sa.String(length=20), nullable=True),
        )

    insp = sa.inspect(conn)
    index_names = {ix["name"] for ix in insp.get_indexes("bookings")}
    if "ix_bookings_public_reference" not in index_names:
        op.create_index(
            "ix_bookings_public_reference",
            "bookings",
            ["public_reference"],
            unique=True,
        )

    from utils.booking_public_reference import generate_public_booking_reference_candidate

    rows = conn.execute(text("SELECT id FROM bookings WHERE public_reference IS NULL")).fetchall()
    for (bid,) in rows:
        for _ in range(64):
            cand = generate_public_booking_reference_candidate()
            exists = conn.execute(
                text("SELECT 1 FROM bookings WHERE public_reference = :r LIMIT 1"),
                {"r": cand},
            ).scalar()
            if not exists:
                conn.execute(
                    text("UPDATE bookings SET public_reference = :r WHERE id = :id"),
                    {"r": cand, "id": bid},
                )
                break

    # SQLite не поддерживает ALTER COLUMN ... SET NOT NULL так, как генерирует SQLAlchemy
    # (sqlite3.OperationalError: near "ALTER": syntax error). После бэкфилла значения
    # заданы; NOT NULL остаётся на уровне приложения / PostgreSQL.
    dialect = conn.dialect.name
    if dialect != "sqlite":
        op.alter_column(
            "bookings",
            "public_reference",
            existing_type=sa.String(20),
            nullable=False,
        )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("bookings")}
    if "public_reference" not in cols:
        return
    try:
        op.drop_index("ix_bookings_public_reference", table_name="bookings")
    except Exception:
        pass
    op.drop_column("bookings", "public_reference")
